/**
 * @file cycles_handler.js
 * @brief Ce fichier calcule et affiche les positions des barres d'annotation sur le canvas vidéo.
 */

import { displayMode, selected_swim, temp_start, selected_cycle, last_checkpoint, vue_du_dessus } from './refactor-script.js';
import { findVideoByType, megaData, curr_swims, frame_rate, pool_size, n_camera, turn_distances, turn_times, getDisplayLaneIndex } from './loader.js';
import { draw_stats } from './side_views.js';
import { updateTable } from './main.js';
import { construct_modify_selected_annotation_table } from './data_handler.js';
import { getSize } from './utils.js';
import { getBar, get_orr, eucDistance } from './homography_handler.js';
import { getVideoDisplayTransform } from './video_surface.js';
/**
 * @brief Dictionnaire des couleurs pour chaque type d'événement de natation
 * Associe chaque mode d'annotation (cycle, turn, finish, etc.) à sa couleur d'affichage
 */
export let mode_color = {
    "reaction": "rgba(42, 164, 216, 0.5)",
    "enter": "rgba(0, 0, 255, 0.5)",
    "end": "rgba(0, 255, 0, 0.5)",
    "breakout": "rgba(0, 255, 0, 0.5)",
    "cycle_droite": "rgba(35, 33, 86, 0.5)",
    "cycle": "rgba(35, 33, 86, 0.5)",
    "cycle_gauche": "rgba(35, 33, 86, 0.5)",
    "section": "rgba(255, 247, 0, 0.5)",
    "respi": "rgba(189, 56, 56, 0.5)",
    "breath": "rgba(189, 56, 56, 0.5)",
    "respi_gauche": "rgba(189, 56, 56, 0.5)",
    "respi_droite": "rgba(189, 56, 56, 0.5)",
    "turn": "rgba(68, 68, 68, 0.5)",
    "finish": "rgba(52, 52, 52, 0.5)",
    "dolphin": "rgba(138, 43, 226, 0.5)"
};

/**
 * @brief Contrôle l'affichage des labels sur les barres d'annotation
 * Boolean correspondant au bouton Show Labels : true -> affichage des labels des annotations, false -> pas d'affichages de ces labels
 */
export let lab_flipper = true;

function videoPointToDisplay(point, meta) {
    const transform = getVideoDisplayTransform(meta);
    if (!transform || !Array.isArray(point)) {
        return null;
    }
    return {
        x: transform.x + Number(point[0]) * transform.k,
        y: transform.y + Number(point[1]) * transform.k,
        k: transform.k
    };
}

/**
 * @brief Construction d'une barre d'annotation visuelle sur le canvas vidéo
 * Crée un élément canvas avec la couleur et position appropriées selon le type d'événement
 *
 * Utilisation de variables globales : 
 * lab_flipper
 * frame_rate
 * 
 * @param {dictionary} data element of curr_swims[id_swim]
 * @param {number} idx index Of data in curr_swims[id_swim]
 * @param {number} idswim id of the swimmer
 * @param {array} scale array of [scale width, scale height]
 * @param {number} elemSize [twidth, theight] -> size of video shown in navigateur
 * @param {number} vidSize [twidth, theight] -> original size of video
 * @param {number} meta video meta
 * @return {array} [can, div] canvas and div
 */
export function makeBar(data, idx, idswim, scale, elemSize, vidSize, meta) {
    let can = document.createElement("canvas");
    let context = can.getContext("2d")
    can.width = 3

    can.setAttribute("class", "crop_can")
    can.setAttribute("swim", idswim)
    can.setAttribute("num", idx)
    let pts = getBar([data.x, data.y], meta, getDisplayLaneIndex(idswim, meta))
    const displayStart = videoPointToDisplay(pts[0], meta);
    const displayScale = displayStart?.k ?? (elemSize[0] / vidSize[0]);


    can.height = Math.max(1, Math.round((eucDistance(pts[0], pts[1])) * displayScale * 1.2))

    let pointer_color = "red"

    if(data.mode in mode_color){
        pointer_color = mode_color[data.mode]
    }
    context.fillStyle = pointer_color

    context.fillRect(1, 0, 1, 300)
    context.fillRect(0, 0, 3, 5)
    context.fillRect(0, can.height - 5, 3, 300)
    can.style["top"] = displayStart ? `${displayStart.y}px` : (scale[1](pts[0][1])) + "%";
    can.style["left"] = displayStart ? `${displayStart.x}px` : (scale[0](pts[0][0])) + "%";

    can.style["transform"] = "rotate(" + get_orr(pts[0], pts[1]) + "deg)"

    let div = document.createElement("div");
    if (lab_flipper) {

        div.setAttribute("class", "div_can")
        div.setAttribute("swim", idswim)
        div.setAttribute("num", idx)

        div.innerHTML = "<p>#" + idx + "<br> " + (parseInt(data["cumul"] * 100) / 100).toString() + "m <br>" + ((data.frame_number / frame_rate)).toFixed(2) + "s</p>"

        div.style["left"] = displayStart ? `${displayStart.x - displayScale}px` : (scale[0](pts[0][0] - 1) + 0.4) + "%";
        div.style["top"] = displayStart ? `${displayStart.y + 3 * displayScale}px` : (scale[1](pts[0][1]) + 3) + "%";
        div.style["height"] = can.height + "px"
        div.style["transform"] = "rotate(" + get_orr(pts[0], pts[1]) + "deg)"
    }
    return [can, div]
}

/**
 * @brief Surligne visuellement un cycle spécifique dans les graphiques de vérification
 * Réduit l'opacité de tous les éléments sauf le cycle sélectionné pour le mettre en évidence
 * 
 * Utilisation de variables globales : 
 * selected_swim
 * 
 * @param {number} swim id du nageur
 * @param {number} num numéro de la donnée
 */
export function highlightCycle(swim, num) {
    // Remettre d'abord toutes les barres à leur couleur d'origine
    d3.selectAll("rect").style("fill", "rgba(11, 99, 206, 1)")
    d3.selectAll(".cycleDots").style("fill", "rgba(11, 99, 206, 1)")
    
    d3.selectAll(".hcans2").attr("class", "crop_can")

    d3.selectAll(".crop_can").style("opacity", 0.6)
    d3.selectAll("rect").style("opacity", 0.2)
    d3.selectAll("circle").style("opacity", 0.2)

    d3.selectAll("rect[num='" + num + "'][swim='" + swim + "']").attr("class", "hrects").style("opacity", 1).style("fill", "red")
    d3.selectAll(".crop_can[num='" + num + "'][swim='" + swim + "']").attr("class", "crop_can hcans2").style("opacity", 1)

    d3.selectAll(".cycleDots[num='" + num + "']").style("fill", "red").style("opacity", 1)

}

/**
 * @brief Réinitialise le surlignage des barres dans les graphiques de vérification
 * Remet l'opacité normale à tous les éléments visuels (barres, cercles, etc.)
 */
export function resetHigh() {
    d3.selectAll(".hrects").attr("class", "")
    d3.selectAll(".hcans2").attr("class", "crop_can")

    d3.selectAll(".crop_can").style("opacity", 1)
    d3.selectAll("rect").style("opacity", 1).style("fill", "rgba(11, 99, 206, 1)")
    d3.selectAll("circle").style("opacity", 1)

    d3.selectAll(".cycleDots").style("fill", "rgba(11, 99, 206, 1)").style("opacity", 1)
}

/**
 * @brief Met à jour rapidement l'affichage lié aux cycles sans redessin complet
 * Version optimisée de update_cycle qui utilise la mise à jour partielle des barres
 */

export function update_cycle_rapide() {
    updateBarsFromEvent(selected_swim);
    highlightCycle(selected_swim, selected_cycle)
    draw_stats(curr_swims[selected_swim])
    updateTable()
    construct_modify_selected_annotation_table(false)
}

    
/**
 * @brief Retourne le dernier checkpoint franchi à une frame donnée de la course
 * Détermine quelle distance de référence (0, 25, 50, 75m etc.) a été franchie en dernier
 *
 * @param {number} checkpoints Array of checkpoints : [0,25,50,75,...]
 * @param {number} run_frameId The frameId of the considered position
 * @return {number} last_checkpoint an element of checkpoints so that  last_checkpoint < cumul at run_frameId < next_checkpoint
 */
export function get_last_checkpoint(checkpoints,run_frameId){
    let id_last_checked_checkpoint = 0;

    for(let i = 0; i < curr_swims[selected_swim].length ; i ++){
        if(curr_swims[selected_swim][i].frameId > run_frameId){
            break;
        }

        let cumulAct = curr_swims[selected_swim][i].cumul
        while(id_last_checked_checkpoint + 1 < checkpoints.length && cumulAct >= checkpoints[id_last_checked_checkpoint + 1]){
            id_last_checked_checkpoint += 1
        }

    }
    return checkpoints[id_last_checked_checkpoint]
}
    
/**
 * @brief Calcule la distance cumulative à partir de la position dans la piscine
 * Convertit une position physique dans la piscine en distance totale parcourue en tenant compte des allers-retours
 *
 * @param {number} pool_meter_plot_label : pool position : number between 0 and 50
 * @return {number} cumul distance 
 */
export function get_meter_plot_label(pool_meter_plot_label){
    let metaDroite = ((megaData[0].videos.length > 1) ? findVideoByType(megaData[0].videos, "fixeDroite") : megaData[0].videos[0]);
    if (metaDroite["start_side"] === "left") {
        pool_meter_plot_label = pool_size[0] - pool_meter_plot_label;
    }
    let nb50 = Math.floor(last_checkpoint/pool_size[0])
    let nb2 = nb50%2
    // Ex pour pool_meter_plot_label = 40
    // last_checkpoint (nb50,nb2) -> cumul
    // 0                (0,0)     -> 40
    // 50               (1,1)     -> 60  ie 50 + (50-40)
    // 100              (2,0)     -> 140 ie 100 + 40
    // 150              (3,1)     -> 160 ie 150 + (50-40)
    return nb50*pool_size[0] + pool_size[0]*nb2 + (2*(1-nb2)-1)*pool_meter_plot_label
}

/**
 * @brief Modifie l'état d'affichage des labels sur les barres d'annotation
 * @param {boolean} x Nouvel état pour l'affichage des labels
 */
export function edit_lab_flipper(x){
    lab_flipper=x;
}

/**
 * @brief Met à jour dynamiquement les barres d'annotation d'un nageur à partir d'un certain eventId (inclus).
 * Seules les barres dont l'id d'événement est >= eventId sont supprimées et reconstruites, les autres ne sont pas touchées.
 * la valeur de eventId est déterminée généralement par la frame courante de la vidéo avec des exeption s'il faut refresh la ligne et si le mode d'affichage est 1 ou 2.
 * @param {number} swim Id du nageur
 * @param {number} eventId Premier id d'événement à mettre à jour (inclus)
 * @param {boolean} affiche_tout Si true, affiche toutes les barres à partir du dernier virage, sinon ne met à jour que les barres des cycles depuis l'instant de la vidéo.
 * @param {object} meta Métadonnées vidéo (optionnel, sinon auto-détecté)
 */
export function updateBarsFromEvent(swim, affiche_tout=false ,meta = null) {
    // Récupère le conteneur vidéo
    const vid = document.getElementById("vid");
    const currentFrame = Math.floor((vid.currentTime - temp_start) * frame_rate)>0 ? Math.floor((vid.currentTime - temp_start) * frame_rate) : 0;
    let lastTurnFrame = 0, nextTurnFrame = Infinity;
    for (let i = 1; i < turn_distances.length; i++) {//0 est le temps de réaction, on ne le prend pas en compte
        const t = turn_times[swim][turn_distances[i]];
        if (t !== undefined) {
            const f = t * frame_rate;
            if (f <= currentFrame){
                lastTurnFrame = f;
            }
            else if (f > currentFrame && nextTurnFrame === Infinity) {
                nextTurnFrame = f;
                break;
            }
        }
    }
    let data = curr_swims[swim].filter(d => d.event !== "reaction" && d.event !== "finish" && d.event !=="turn");
    let eventId;
    if (affiche_tout) {
        let index = findCycleIndexAtFrame(data, lastTurnFrame);
        eventId = (index==0)? 0 : index+1;// On commence à afficher à partir du cycle suivant le dernier virage si il y a déjà eu un virage puisque data filtre les virages

    }
    else {
        eventId = findCycleIndexAtFrame(data, currentFrame);
        eventId = (typeof eventId === "number" && !isNaN(eventId) && eventId >= 0) ? eventId : 0;
    }
    // Supprime toutes les barres et labels dont num >= eventId pour ce nageur
    let container = document.getElementById("video")
    if (affiche_tout){
        $(".crop_can").remove()
        $(".div_can").remove();
    }
    else {
        
        let toRemove = container.querySelectorAll(`.crop_can[swim='${swim}'][num]`);
        toRemove.forEach(el => {
            if (parseInt(el.getAttribute('num')) >= eventId) el.remove();
        });
        let toRemoveDiv = container.querySelectorAll(`.div_can[swim='${swim}'][num]`);
        toRemoveDiv.forEach(el => {
            if (parseInt(el.getAttribute('num')) >= eventId) el.remove();
        });}
    if (displayMode === "2") {
        return // If display mode is "none", do not show anything.
    }


    if (!meta) {
        if (n_camera > 1) {
            if (!megaData || !Array.isArray(megaData) || !megaData[0] || !megaData[0].videos) {
                console.warn('megaData not properly initialized in updateBarsFromEvent');
                return;
            }
            meta = findVideoByType(megaData[0].videos, "fixeDroite");
            const src = vid?.currentSrc || vid?.getAttribute("src") || "";
            const matchingMeta = megaData[0].videos.find((video) => video.name && src.includes(video.name));
            if (matchingMeta) {
                meta = matchingMeta;
            }
        } else {
            if (!megaData || !Array.isArray(megaData) || !megaData[0] || !megaData[0].videos) {
                console.warn('megaData not properly initialized in updateBarsFromEvent');
                return;
            }
            meta = megaData[0].videos[0];
        }
        if (vue_du_dessus) {
            meta = findVideoByType(megaData[0].videos, "dessus") || meta;
        }
    }
    let [twidth, theight] = getSize(meta);
    let tpool_xscale = d3.scaleLinear([twidth, 0], [100, 0]);
    let tpool_yscale = d3.scaleLinear([0, theight], [0, 100]);
    if (twidth === 2074){ tpool_yscale = d3.scaleLinear([0, theight], [-3, 101]);
    }
    let element = $("#video");
    let size = [element.width(), element.height()];

    

    // Reconstruit les barres à partir de eventId
    let indice_max=findCycleIndexAtFrame(data, nextTurnFrame);
    if (displayMode === "1") {
        eventId=Math.max(indice_max-1,0);//mode où on veut uniquement 2 affichages de cycle
    }
    for (let idx = eventId; idx < data.length; idx++) {
        // Exclure les événements de type 'turn' de l'affichage
        if (idx > indice_max) break;
        let d = data[idx];
        let [can, div] = makeBar(d, idx, swim, [tpool_xscale, tpool_yscale], size, [twidth, theight], meta);
        container.appendChild(can);
        if (lab_flipper) container.appendChild(div);
    }
}




/**
 * @brief Trouve l'indice du cycle le plus proche (inférieur ou égal) à la frame courante de la vidéo
 * @param {Array} swimData - Tableau des cycles pour un nageur (curr_swims[swim])
 * @param {number} currentFrame - Frame courante de la vidéo
 * @returns {number} - L'indice du cycle trouvé, ou -1 si aucun
 */
export function findCycleIndexAtFrame(swimData, currentFrame) { 
    for (let i = swimData.length - 1; i >= 0; i--) {
        if (parseInt(swimData[i].frame_number) <= currentFrame) {
            return i;
        }
    }
    return 0;
}
