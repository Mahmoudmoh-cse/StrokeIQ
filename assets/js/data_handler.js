/**
 * @file data_handler.js
 * @brief Gère le traitement, la transformation et l'enregistrement des données d'annotation.
 */

import { curr_swims, edit_temp_end, frame_rate, temp_end, inter, pool_size } from "./loader.js";
import { selected_swim,sec_to_timestr, temp_start, selected_cycle,edit_selected_cycle,edit_flipper, selected_num,edit_selected_num } from "./refactor-script.js";
import { update_swimmer } from "./side_views.js";
import { frameId_to_RunTime } from "./main.js";
import { highlightCycle } from "./cycles_handler.js";

import { predit_delta_cycle_dos } from "./ml-cycle-predictor-js/js/predictor.js";



let nb_of_last_added_data_saved = 6;
export let last_added_data = [];
let prochain_cycle_predit;








/**
 * @brief Détermine la frame de fin de la vidéo à partir des données d'annotation.
 * @param {Array} data Données d'annotation (toutes lignes)
 * @param {number} distance Distance totale de la course
 */
export function find_end(data, distance) {

    let maxs = []
    const swimmerIds = [...new Set(data.map((d) => d.swimmer).filter((swimmer) => swimmer !== undefined))];
    for (let i = 0; i < swimmerIds.length; i++) {
        let sw = data.filter((d) => d.swimmer == swimmerIds[i]);
        if (sw.length === 0) {
            continue;
        }
        let t
        if (distance > pool_size[0]) {
            t = sw.find((d) => d.xd > 2);
        } else {
            t = sw.find((d) => d.xd > 48);
        }
        if (t === undefined) {
            let tend = Math.max(...sw.map((d) => d.x1));
            t = sw.filter((d) => d.x1 == tend)[0];
        }
        if (t !== undefined) {
            maxs.push(t.frame_number);
        }
    }

    if (maxs.length > 0) {
        edit_temp_end ( temp_start + (Math.max(...maxs) / frame_rate));
    } else {
        let vid = document.getElementById("vid")
        edit_temp_end(vid.duration);
    }
}

/**
 * @brief Transforme les données d'annotation brutes en format exploitable pour l'application (annotations manuelles ou automatiques).
 * @param {Array} data Données d'annotation (CSV parsé)
 * @returns {Array} Données formatées
 */
export function curate_annotate_data(data) {

    if (data[0].cycleX) {
        return data.map(d => {
            d["frame_number"] = d.frameId
            d["swimmer"] = d.swimmerId
            d["x"] = d.cycleX
            d["y"] = d.cycleY
            d["ogx"] = d.x
            d["ogy"] = d.y
            d["mode"] = d.event

            return d
        })
    } else {

        return data.map(d => {

            d["frame_number"] = d.frameId
            d["swimmer"] = d.swimmerId
            d["x"] = d.eventX
            d["y"] = d.eventY
            d["ogx"] = d.x
            d["ogy"] = d.y
            d["mode"] = d.event
            return d
        })
    }
}

/**
 * @brief Transforme les données d'annotation pour affichage/traitement, ajuste les coordonnées et filtre les points inutiles.
 * @param {Array} data Données d'annotation (CSV parsé)
 * @param {Object} meta Métadonnées de la course
 * @returns {Array} Données formatées et filtrées
 */
export function curate_data(data, meta) {

    if (data[0].x1 !== undefined) {
        data = data.map(d => {
            d["x"] = d.x1
            d["y"] = d.y1
            return d
        })
    }

    data = data.map(d => {
        d["x"] = d.xd
        d["y"] = d.yd
        return d
    })

    let maxy = Math.max(...data.map(d => d.y))

    if (maxy > 30) {
        let fixscale = d3.scaleLinear([30, 50], [0, pool_size[1]]).clamp(true);

        data.map(d => {
            d["y"] = fixscale(d["y"])
            return d
        })
    }
    let t_end = getAvg(meta)

    if (t_end) {
        edit_temp_end( t_end);
    }

    data = data.filter(d => d.x != -1 && d.frame_number < temp_end * frame_rate && d.frame_number % inter == 0).map(d => {
        d["ogx"] = d.x
        d["ogy"] = d.y
        return d
    })
    return data
}

/**
 * @brief Calcule la durée maximale annotée à partir des temps présents dans les métadonnées.
 * @param {Object} data Métadonnées de la course
 * @returns {number} Durée maximale (secondes) ou -1 si non trouvée
 */
export function getAvg(data) {

    if (data["temps"]) {
        let t = []
        let keys = Object.keys(data["temps"])

        for (let i = 0; i < keys.length; i++) {
            t.push(format_time(data["temps"][keys[i]]))
        }
        return Math.max(...t)
    } else {
        return -1 //If there is no annotated time.
    }
}

/**
 * @brief Ajoute un élément d'annotation à la structure globale, met à jour l'historique et prédit le prochain cycle.
 * @param {Object} element Annotation à ajouter
 * @param {number} id_swim Id du nageur
 */
export function add_element_to_data(element, id_swim) {
    curr_swims[id_swim].push(element)
    curr_swims[id_swim] = currate_events(curr_swims[id_swim])
    if (last_added_data == []) {
        last_added_data = new Array(nb_of_last_added_data_saved).fill(null);
    }
    for (let i = nb_of_last_added_data_saved - 1; i > 0; i--) {
        last_added_data[i] = last_added_data[i - 1]
    }
    last_added_data[0] = element
    construct_last_added_data_table();
    if (last_added_data[5]){
        let delta_prochain_cycle_predit=predit_delta_cycle_dos();
        prochain_cycle_predit=(delta_prochain_cycle_predit+parseFloat(last_added_data[0].frameId))/50;
    }
}

/**
 * @brief Place la vidéo à l'instant prédit du prochain cycle (si disponible).
 */
export function go_to_next_cycle(){
    if (prochain_cycle_predit != undefined) {
        let vid = document.getElementById("vid")
        vid.currentTime = prochain_cycle_predit+ temp_start;
    }
}

/**
 * @brief Met à jour le tableau HTML affichant les dernières annotations ajoutées.
 */
export function construct_last_added_data_table() {
    let table = $("#last_data_entry_table")
    table.empty()
    let r;
    for (let j = 0; j < last_added_data.length; j++) {
        r = last_added_data[j];
        if (r != undefined) {
            table.append(construct_data_row(r));
        }
    }
}

/**
 * @brief Met à jour le tableau de modification de l'annotation sélectionnée.
 * @param {boolean} isEmpty true si aucune annotation sélectionnée, false sinon
 */
export function construct_modify_selected_annotation_table(isEmpty) {
    if (isEmpty) {
        let top_table = document.getElementById("modify_selected_annotation_top_table")
        top_table.style.display = 'none';
        let error_msg = document.getElementById("modify_selected_annotation_error")
        error_msg.style.display = 'inline';
    } else {
        let top_table = document.getElementById("modify_selected_annotation_top_table")
        top_table.style.display = 'inline';
        let error_msg = document.getElementById("modify_selected_annotation_error")
        error_msg.style.display = 'none';
        let table = $("#modify_selected_annotation_table")
        table.empty()
        if (selected_swim != undefined && selected_cycle != undefined) {
            let r = curr_swims[selected_swim][selected_cycle]
            if (r != undefined) {
                table.append(construct_data_row(r))
            } else {
                construct_modify_selected_annotation_table(true)
            }
        } else {
            construct_modify_selected_annotation_table(true)
        }
    }

}

/**
 * @brief Construit une ligne HTML pour une annotation donnée.
 * @param {Object} data Annotation à afficher
 * @returns {string} Ligne HTML
 */
export function construct_data_row(data) {
    let mess = `<tr class='mode-` + data["mode"] + `' data-swimmer='` + data.swimmer + `' data-event='` + curr_swims[data.swimmer].indexOf(data) + `'>` +
        " <td>" + sec_to_timestr(frameId_to_RunTime(data["frame_number"])) + "</td>" +
        " <td>" + (parseInt(data["cumul"] * 100) / 100).toString() + "</td>" +
        " <td>" + data["mode"] + "</td>" +
        "</tr>"
    return mess
}

/**
 * @brief Gère le clic sur une annotation dans le tableau, met à jour la sélection et la vidéo.
 * @param {number} swimmerId Id du nageur
 * @param {number} eventId Id de l'événement/annotation
 */
export function data_onclick(swimmerId, eventId) {
    edit_flipper( true);
    let vid = document.getElementById("vid")
    vid.style.cursor = "pointer"

    const selected_swim = swimmerId
    edit_selected_num(eventId);
    edit_selected_cycle( parseInt(selected_num));
    vid.currentTime = temp_start + curr_swims[selected_swim][selected_cycle].frame_number / frame_rate
    vid.scrollIntoView();
    update_swimmer(selected_swim)
    highlightCycle(selected_swim, selected_num)
    construct_modify_selected_annotation_table(false)
}
window.data_onclick = data_onclick;

function format_time(time) {
    let ftr = [60, 1]
    let temp = time.split(":")

    return temp.map((d, i) => parseInt(d) * ftr[i]).reduce((partialSum, a) => partialSum + a, 0)
}













/**
 * @brief Trie et numérote les événements d'annotation d'un nageur.
 * @param {Array} events Liste d'événements
 * @returns {Array} Liste triée et numérotée
 */
export function currate_events(events) {

    events.sort((a, b) => a.frameId - b.frameId)
    for (let i = 0; i < events.length; i++) {

        events[i].eventId = i
    }
    return events
}

/**
 * @brief Transforme la structure des flat.json en dictionnaire clé/valeur utilisable.
 * @param {Array} data Données flat (JSON)
 * @returns {Object} Dictionnaire clé/valeur
 */
export function make_flat_usable(data) {

    let res = {}

    for (let i = 0; i < data.length; i++) {

        let temp = data[i]
        if (temp["type_video"]) {
            if (temp["type_video"].includes("fixe")) {
                let key = temp["name"].replace("_" + temp["type_video"] + ".mp4", "")
                res[key] = temp
            }
        }
    }
    return res
}

/**
 * @brief Gère l'affichage des onglets dans l'interface. (tableau des évènenements, graphiques...)
 * @param {Event} event Événement de clic
 * @param {string} tabName Nom de l'onglet à afficher
 * @param {string} elementsClass Classe des éléments à masquer
 * @param {string} linkClass Classe des liens d'onglet
 */
export function choose_tab(event, tabName, elementsClass, linkClass) {
    // Get all elements with class=elementsClass and hide them
    var tabcontent = document.getElementsByClassName(elementsClass);
    for (let i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }

    // Get all elements with class=linkClass and remove the class "active"
    if (event != null) {
        let tablinks = document.getElementsByClassName(linkClass);
        for (let i = 0; i < tablinks.length; i++) {
            tablinks[i].className = tablinks[i].className.replace(" active", "");
        }
    }

    // Show the current tab, and add an "active" class to the button that opened the tab
    document.getElementById(tabName).style.display = "inline";
    if (event != null) {
        event.currentTarget.className += " active";
    }
}
window.choose_tab = choose_tab;

/**
 * @brief Vide l'historique des dernières annotations ajoutées.
 */
export function vide_last_added_data(){
    last_added_data =[];
}
