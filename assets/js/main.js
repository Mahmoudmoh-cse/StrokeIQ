/**
 * @file main.js
 * @brief fichier principal, importé dans le html, il appelle tous les autres.
 */


import { findVideoByType, init, megaData, curr_swims, frame_rate, temp_end, n_camera, selected_comp, selected_run, getLaneKeysFromRaceMetadata, getConfiguredSwimmerCount, isOneIsUp } from "./loader.js"
import { construct_data_row, data_onclick } from "./data_handler.js"
import { selected_swim, temp_start, updateSwimSwitch, vue_du_dessus } from "./refactor-script.js"
import "./plot_handler.js"
import "./homography_handler.js"
import "./videoHandler.js"
import "./side_views.js"
import "./shortcuts_handler.js"
import { getMeta } from './utils.js'
import { findCycleIndexAtFrame } from "./cycles_handler.js";
import "./plot_handler.js";
import "./jquery-custom.js";
import "./workspace_layout.js";
import "./ml-cycle-predictor-js/js/predictor.js";
import "./configuration_panel.js";
import "./video_configuration.js";
import "./metadata_editor.js";
import "./synchronization.js";
import "./flash_marker.js";
import { getApiBaseUrl, getDataSourceMode, getLocalServerUrl } from "./local_api.js";



// variables pour se reperer suivant les cotés


// Backend link
// Détection automatique de l'environnement
function isGitHubMode() {
    const isElectron = window.myAPI !== undefined;
    return !isElectron && (
        window.location.hostname.includes('github.io') ||
        window.location.hostname.includes('githubusercontent.com') ||
        window.location.pathname.includes('/annotation/')
    );
}

export let local_bool = !isGitHubMode();
export let base = "./";
export const demoDataRoot = typeof document !== "undefined"
    ? new URL("videos/", document.baseURI).href
    : "videos/";





/**
 * @brief Configure l'URL de base selon l'environnement (local ou distant)
 * Définit l'URL du serveur backend selon le mode local/distant sélectionné
 */
export function set_base() {
    if (local_bool) {
        base = "http://localhost:8000/";

    } else {
        // Mode distant - URL configurée via code externe
        base = "";
    }
}

/**
 * @brief Setter pour modifier la variable local_bool
 * @param {boolean} value Nouvelle valeur pour local_bool
 */
export function set_local_bool(value) {
    local_bool = value;
}

/**
 * @brief Setter pour modifier la variable base
 * @param {string} value Nouvelle valeur pour base
 */
export function set_base_url(value) {
    base = value;
}

if (typeof window !== "undefined" && !window.__TEST__) {
    fetch('./package.json')
        .then(response => response.json())
        .then(data => {
            const version = data.version;
            const versionElement = document.getElementById('app-version');
            if (versionElement) {
                versionElement.textContent = version;
            }
        })
        .catch(error => console.error('Error fetching package.json:', error));
}


init();

//Pour la liste deroulante des nageurs;

/**
 * @brief Remplit la liste déroulante des nageurs disponibles
 * Génère les options de sélection des nageurs en tenant compte de l'orientation de la caméra
 * 
 * @param {object} data Données des nageurs avec leurs noms
 */
export function displaySwimmers(data) {

    let container = document.getElementById("swim_switch")
    let meta;

    // Defensive check for megaData
    if (!megaData || !Array.isArray(megaData) || !megaData[0] || !megaData[0].videos) {
        console.warn('megaData not properly initialized, skipping swimmer display');
        return;
    }

    if (n_camera > 1) {
        meta = findVideoByType(megaData[0].videos, "fixeDroite") || megaData[0].videos[0]
    }
    else {
        meta = megaData[0].videos;
    }
    if (vue_du_dessus) {
        meta = findVideoByType(megaData[0].videos, "dessus") || meta;
    }

    const laneKeys = getLaneKeysFromRaceMetadata(megaData[0]);
    const numberOfSwimmers = getConfiguredSwimmerCount(megaData[0]);
    let keys = [...laneKeys]
    if (!isOneIsUp(meta)) {
        keys = keys.reverse()
    }

    for (let i = 0; i < Math.min(keys.length, numberOfSwimmers); i++) {
        const laneIndex = laneKeys.indexOf(keys[i]);
        if (laneIndex >= numberOfSwimmers) continue;
        let optionClass = "swimmer-option" + (laneIndex === selected_swim ? " selected" : "");
        container.insertAdjacentHTML("beforeend", `<option class='${optionClass}' value='${laneIndex}'>${laneIndex + 1}- ${data[keys[i]].replace("�", "é")}</option>`);
    }
    container.disabled = numberOfSwimmers === 1;

    // Synchroniser la valeur du select avec selected_swim
    updateSwimSwitch();
}


//La coloration de la barre en fonction du temp de la video

/**
 * @brief Met à jour le gradient de couleur de la barre temporelle de la vidéo
 * Colore différemment les zones avant, pendant et après la course selon la position actuelle
 * 
 * @param {number} curr Position actuelle de la vidéo (0-1)
 */
export function setGrad(curr) {

    let vid = document.getElementById("vid")
    let meta = getMeta()

    let end = temp_start + temp_end;
    if (temp_end == Infinity || temp_end == -Infinity) {
        end = vid.duration
    }

    let vid_end = vid.duration;

    if (isNaN(vid_end) && meta.maxframe) {
        vid_end = meta.maxframe / frame_rate
    }
    let st = temp_start / vid_end
    let elem = $("#timebar");
    if (curr < st) {
        elem.css('background',
            'linear-gradient(to right,' +
            'rgba(255,0,0,1) 0%, ' +
            'rgba(255,0,0,1) ' + (curr * 100) + '%, ' +
            'rgba(255,0,0,0.3) ' + (curr * 100 + 0.00001) + '%, '
            + 'rgba(255,0,0,0.3) ' + ((st - 0.001) * 100) + '%,'
            + 'rgba(11,99,206,0.3)' + (st * 100) + '%,'
            + 'rgba(11,99,206,0.3) ' + ((end / vid_end) * 100) + '%,'
            + 'rgba(255,0,0,0.3) ' + (((end - 0.001) / vid_end) * 100) + '%,'
            + 'rgba(255,0,0,0.3) ' + (100) + '%'
            + ')'
        );
    } else if (curr >= st && curr < end) {
        elem.css('background',
            'linear-gradient(to right,' +
            'rgba(255,0,0,1) 0%, '
            + 'rgba(255,0,0,1)' + ((st - 0.001) * 100) + '%,'
            + 'rgba(11,99,206,1)' + (st * 100) + '%,'
            + 'rgba(11,99,206,1)' + (curr * 100) + '%, '
            + 'rgba(11,99,206,0.3)' + (curr * 100 + 0.00001) + '%, '
            + 'rgba(11,99,206,0.3)' + ((end / vid_end) * 100) + '%,'
            + 'rgba(255,0,0,0.3)' + (((end - 0.001) / vid_end) * 100) + '%,'
            + 'rgba(255,0,0,0.3)' + (100) + '%'
            + ')'
        );
    } else {
        elem.css('background',
            'linear-gradient(to right,'
            + 'rgba(255,0,0,1) 0%, '
            + 'rgba(255,0,0,1)' + ((st - 0.001) * 100) + '%,'
            + 'rgba(11,99,206,1)' + (st * 100) + '%,'
            + 'rgba(11,99,206,1)' + ((end / vid_end) * 100) + '%,'
            + 'rgba(255,0,0,1)' + (((end - 0.001) / vid_end) * 100) + '%,'
            + 'rgba(255,0,0,1)' + (curr * 100) + '%, '
            + 'rgba(255,0,0,0.3)' + (curr * 100 + 0.00001) + '%, '
            + 'rgba(255,0,0,0.3)' + (100) + '%'
            + ')'
        );
    }
}

/**
 * @brief Met à jour tous les tableaux d'affichage des données d'annotation
 * Reconstruit les tableaux principal et spécialisés (cycles, intermédiaires, respiration, officiels)
 * Ajoute les listeners d'événements pour l'interaction utilisateur
 */
export function updateTable() {
    if (typeof window !== "undefined" && typeof window.normalize_before_table_render === "function") {
        window.normalize_before_table_render();
    }
    let elem = $("#table_bod");
    elem.empty();

    let cycle_table = $("#cycle_table");
    cycle_table.empty();
    let intermed_table = $("#intermed_table");
    intermed_table.empty();
    let respi_table = $("#respi_table");
    respi_table.empty();
    let officiels_table = $("#officiels_table");
    officiels_table.empty();

    // Vérifiez que megaData[0] et megaData[0]["lignes"] existent
    if (megaData[0] && megaData[0]["lignes"]) {
        let ligneKey = "ligne" + (parseInt(selected_swim) + 1).toString();
        if (!megaData[0]["lignes"][ligneKey]) {
            console.error(`La clé ${ligneKey} n'existe pas dans megaData[0]["lignes"]`);
        }
    } else {
        console.error("megaData[0] ou megaData[0]['lignes'] est undefined");
        document.getElementById("swimmerNameForData").innerHTML = "Swimmer: Unknown";
    }
    let data = (curr_swims[selected_swim] || []).filter(d => d.event !== "reaction");
    const vid = document.getElementById("vid");
    const currentFrame = Math.floor((vid.currentTime - temp_start) * frame_rate) > 0 ? Math.floor((vid.currentTime - temp_start) * frame_rate) : 0;
    let frame_cycle_act = findCycleIndexAtFrame(data, currentFrame);
    // Boucle à travers les nageurs
    if (curr_swims[selected_swim]) {
        for (let j = 0; j < curr_swims[selected_swim].length; j++) {
            let r = curr_swims[selected_swim][j];
            const allowedModes = ["enter", "end", "breakout", "respi", "breath", "section", "turn", "finish", "reaction", "cycle", "cycle_gauche", "cycle_droite", "respi_droite", "respi_gauche"];
            // modes autorisés, a modifier pour ajouter des modes ou en enlever
            if (!allowedModes.includes(r["mode"])) {
                r["mode"] = "cycle";
            }


            let mess = construct_data_row(r);
            elem.append(mess);

            // Ajouter à la table appropriée en fonction du mode
            if (r["mode"] == "cycle") {
                cycle_table.append(mess);
            }
            if (r["mode"] == "section" || r["mode"] == "end" || r["mode"] == "breakout" || r["mode"] == "enter") {
                intermed_table.append(mess);
            }
            if (r["mode"] == "respi" || r["mode"] == "breath") {
                respi_table.append(mess);
            }
            if (r["mode"] == "turn" || r["mode"] == "finish") {
                officiels_table.append(mess);
            }
        }
    } else {
        console.error(`curr_swims[${selected_swim}] est undefined`);
    }

    // Après avoir rempli le tableau principal
    // Ajout du listener pour chaque ligne générée dynamiquement
    document.querySelectorAll("#table_bod tr[data-swimmer]").forEach(row => {
        row.addEventListener("click", function () {
            data_onclick(
                this.getAttribute("data-swimmer"),
                this.getAttribute("data-event")
            );
        });
    });
}

/**
 * @brief Détermine le suffixe de côté pour les annotations (gauche/droite)
 * Récupère la sélection radio du côté d'action et remet à neutre après utilisation
 * 
 * @return {string} Suffixe '_gauche', '_droite' ou '' pour neutre
 */
function getCoteActionSuffix() {
    const selected = document.querySelector('input[name="cote_action"]:checked');
    if (!selected) return '';

    let suffix = '';
    switch (selected.value) {
        case '0':
            suffix = '_gauche';
            break;
        case '1':
            suffix = ''; // neutre
            break;
        case '2':
            suffix = '_droite';
            break;
    }

    // Réinitialise à neutre
    const neutreRadio = document.querySelector('input[name="cote_action"][value="1"]');
    if (neutreRadio) neutreRadio.checked = true;

    return suffix;
}

/**
 * @brief Convertit un ID de frame en temps de course
 * Calcule le temps en secondes à partir du numéro de frame et du frame rate
 * 
 * @param {number} frameId Numéro de la frame
 * @return {string} Temps en secondes (format string)
 */
export function frameId_to_RunTime(frameId) {
    return ((frameId) / frame_rate).toString()
}

/**
 * @brief Calcule les métriques de natation (tempo, fréquence, amplitude, vitesse)
 * Détermine les valeurs de performance selon le style de nage et la distance
 * 
 * @param {string} epreuveStyle Style de nage (freestyle, dos, 4nages, etc.)
 * @param {string} epreuveDistance Distance de l'épreuve
 * @param {array} tempo Tableau des temps de cycles
 * @param {array} ampli Tableau des amplitudes de cycles
 * @param {number} longueur Longueur de bassin actuelle
 * @return {object} Objet contenant tempoRow, frequenceRow, amplitudeRow, vitesseRow
 */
export function metrics_calculation(epreuveStyle, epreuveDistance, tempo, ampli, longueur) {
    let tempoRow = (tempo[tempo.length - 1] - tempo[tempo.length - 2])
    let frequenceRow = (60.0 / (tempo[tempo.length - 1] - tempo[tempo.length - 2]))
    let amplitudeRow = (ampli[ampli.length - 1] - ampli[ampli.length - 2])
    let vitesseRow = ((ampli[ampli.length - 1] - ampli[ampli.length - 2]) / (tempo[tempo.length - 1] - tempo[tempo.length - 2])).toFixed(2)

    if (epreuveStyle === "freestyle" || epreuveStyle === "dos") {
        tempoRow *= 2;
        frequenceRow /= 2;
        amplitudeRow *= 2;
    } else if (epreuveStyle === "4nages") {
        if ((epreuveDistance === "400" && [3, 4, 7, 8].includes(longueur)) || epreuveDistance === "200" && [2, 4].includes(longueur)) {
            return {
                tempoRow: (tempoRow * 2).toFixed(2),
                frequenceRow: (frequenceRow / 2).toFixed(2),
                amplitudeRow: (amplitudeRow * 2).toFixed(2),
                vitesseRow: vitesseRow
            };
        }
    }

    return {
        tempoRow: tempoRow.toFixed(2),
        frequenceRow: frequenceRow.toFixed(2),
        amplitudeRow: amplitudeRow.toFixed(2),
        vitesseRow: vitesseRow
    };
}







// Ajout des listeners pour les liens Version et Aide (CSP compatible)
document.addEventListener("DOMContentLoaded", function () {
    const versionLink = document.getElementById("version-link");
    if (versionLink) {
        versionLink.addEventListener("click", function (e) {
            e.preventDefault();
            if (typeof downloadVersion === 'function') downloadVersion();
        });
    }
    const aideLink = document.getElementById("aide-link");
    if (aideLink) {
        aideLink.addEventListener("click", function (e) {
            e.preventDefault();
            if (typeof downloadRaccourcis === 'function') downloadRaccourcis();
        });
    }

    document.getElementById("view_data_source")?.addEventListener("click", function () {
        if (!selected_comp || !selected_run) {
            return;
        }

        const source = getDataSourceMode();
        let url;
        if (source === "api") {
            url = `${getApiBaseUrl()}/getDatas/${selected_comp}/${selected_run}`;
        } else if (source === "local") {
            url = `${getLocalServerUrl()}/getDatas/${selected_comp}/${selected_run}`;
        } else {
            url = new URL(`videos/${selected_comp}/${selected_run}/`, document.baseURI).href;
        }
        window.open(url, "_blank", "noopener");
    });
});

/**
 * @brief Ouvre la page de téléchargement de la dernière version
 * Redirige vers la page GitHub des releases
 */
function downloadVersion() {
    window.open('https://github.com/Mahmoudmoh-cse/StrokeIQ', '_blank')

}

/**
 * @brief Télécharge l'image des raccourcis clavier
 * Crée un lien de téléchargement pour l'aide des raccourcis clavier
 */
function downloadRaccourcis() {
    const link = document.createElement('a');
    link.href = './assets/aide/Raccourcis_clavier_V2.jpg'; // Chemin vers ton image
    link.download = 'StrokeIQ_shortcuts.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

}
