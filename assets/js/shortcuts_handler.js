/**
 * @file shorcut_handler.js
 * @brief gère tous les raccourcis, une infographie est présente dans le dossier aide.(pas encore à jour sur laction de maj+c,v,x,w.)
 */

import { selected_swim,temp_start, selected_cycle, edit_selected_cycle, clic_souris_video, zoom, zoom_step, plot_cursor, annotate } from "./refactor-script.js";
import { curr_swims, frame_rate, getLaneYPosition } from './loader.js';
import { updateTable } from './main.js';
import { shortcut_enabled } from "./jquery-custom.js";
import { indicator_correction,show_indicator_lines, action_indicator_lines } from './plot_handler.js';
import { highlightCycle } from "./cycles_handler.js";
import { moveVid } from "./videoHandler.js";
import { getMeta } from './utils.js';
import { go_to_next_cycle } from "./data_handler.js";



export function simulateMouseClick() {

    const videoElement = document.getElementById("vid");

    // Vérifier si la souris est sur l'élément "vid"
    const mouseX = window.mousePosition.x;
    const mouseY = window.mousePosition.y;
    const elementUnderMouse = document.elementFromPoint(mouseX, mouseY);

    if (elementUnderMouse === videoElement) {
        // La souris est sur l'élément "vid" et Shift est maintenu
        const clickEvent = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            clientX: mouseX,
            clientY: mouseY
        });

        // Appeler la fonction clic_souris_video avec l'événement
        clic_souris_video({clickEvent, target: videoElement,clientX: window.mousePosition.x,clientY: window.mousePosition.y});
    }
}

/**
 * @brief Position du curseur d'annotation (entre 0 et 50 mètres)
 * Décrit la position actuelle du curseur d'annotation dans la piscine
 */
export let positionCurseur = 0;

/**
 * @brief Position horizontale de la vidéo lors du déplacement
 * Coordonnée X de la vidéo pour le système de drag & drop
 */
export let tleft;

/**
 * @brief Position verticale de la vidéo lors du déplacement
 * Coordonnée Y de la vidéo pour le système de drag & drop
 */
export let ttop;
let vid = document.getElementById("vid")



const keymap = {};

window.onkeyup = function (e) {
    if (e.keyCode in keymap) {
        keymap[e.keyCode] = false;
    }
};

window.onkeydown = function (e) {
    e = e || event;
    keymap[e.keyCode] = e.type === 'keydown';

    //console.log(e.keyCode)
    if (shortcut_enabled) {
        
        // Gestion Placement Vidéo :
        if (keymap[38] || keymap[79]) { // o ou flèche haut --> déplacement de la vidéo vers le haut
            let elem = $("#video")
            ttop = parseInt(elem.css("top"), 10) + 10;
            tleft = parseInt(elem.css("left"), 10);
            moveVid(elem,tleft,ttop)
        }
        if (keymap[37] || keymap[75]) { // k ou flèche gauche --> déplacement de la vidéo vers la gauche
            let elem = $("#video")
            ttop = parseInt(elem.css("top"), 10);
            tleft = parseInt(elem.css("left"), 10) + 10;
            moveVid(elem,tleft,ttop)
        }
        if (keymap[40] || keymap[76]) { // l ou flèche bas --> déplacement de la vidéo vers le bas
            let elem = $("#video")
            ttop = parseInt(elem.css("top"), 10) - 10;
            tleft = parseInt(elem.css("left"), 10);
            moveVid(elem,tleft,ttop)
        }
        if (keymap[39] || keymap[77]) { // m ou flèche droite --> déplacement de la vidéo vers la droite
            let elem = $("#video")
            ttop = parseInt(elem.css("top"), 10);
            tleft = parseInt(elem.css("left"), 10) - 10;
            moveVid(elem,tleft,ttop)
        }
        if (keymap[90] && !e.ctrlKey) { // z --> zoom dans la vidéo
            zoom((zoom_step / 100))
        }
        if (keymap[90] && e.ctrlKey) { // Ctrl + z --> accélère la vidéo de 0.1
            e.preventDefault()
            vid.playbackRate += 0.1;
            vid.playbackRate = Math.min(Math.max(vid.playbackRate, 0.1), 1.0);
            $("#speed").html("x" + vid.playbackRate.toFixed(1));
            let elem = $("#poolop");
            elem.val(vid.playbackRate);
            let val = parseFloat(elem.val());
            let val2 = val + 0.0001;
            elem.css('background',
                'linear-gradient(to right,'
                + 'rgba(11, 99, 206, 1) 0%, '
                + 'rgba(11, 99, 206, 1) ' + (val * 100) + '%, '
                + '#FFF ' + (val2 * 100) + '%, '
                + '#FFF 100%) '
            );
        }
        if (keymap[83] && !e.ctrlKey) { // s --> dé-zoom de la vidéo
            zoom(-(zoom_step / 100))
        }
        if (keymap[83] && e.ctrlKey) { // Ctrl + s --> ralenti la vidéo de 0.1
            e.preventDefault()
            vid.playbackRate -= 0.1;
            vid.playbackRate = Math.min(Math.max(vid.playbackRate, 0.1), 1.0);
            $("#speed").html("x" + vid.playbackRate.toFixed(1));
            let elem = $("#poolop");
            elem.val(vid.playbackRate);
            let val = parseFloat(elem.val());
            let val2 = val + 0.0001;
            elem.css('background',
                'linear-gradient(to right,'
                + 'rgba(11, 99, 206, 1) 0%, '
                + 'rgba(11, 99, 206, 1) ' + (val * 100) + '%, '
                + '#FFF ' + (val2 * 100) + '%, '
                + '#FFF 100%) '
            );
        }

        // Gestion options intermédiaires
      
        if (keymap[70]) { // f --> switch side
            $("#vidsw").click()
        }
        if (keymap[82]) { // r --> Reset Zoom
            $("#resetZoom").click()
        }

        // Gestion mode d'annotation
        if (keymap[88]&&!keymap[16]) { // x --> intermed
            $("#ligneRef").click()
        }
        if (keymap[78]){
            if ($("#run_part1").val() !== "freestyle" && $("#run_part1").val() !== "dos") {
                console.log("Type de nage non supporté pour les prédictions : " + $("#run_part1").val());
            } else {
                go_to_next_cycle();
            }
        }

document.addEventListener("mousemove", function (e) {
    // Stocker la position actuelle de la souris
    window.mousePosition = {
        x: e.clientX,
        y: e.clientY
    };
});
if (keymap[87]) { // w --> respi
    $(".modebtn[name='respi']").click()
    if (keymap[16]) { // Shift est maintenu
        simulateMouseClick()
    }
}
if (keymap[67]) { // c --> cycle
    $(".modebtn[name='cycle']").click()
    if (keymap[16]) { // Shift est maintenu
        simulateMouseClick()
    }
}
if (keymap[86]) { // v --> end of underwater
    $(".modebtn[name='end']").click();
    if (keymap[16]) { // Shift est maintenu
        simulateMouseClick()
    } 
}
if (keymap[66]) { // b --> enter the water
    $(".modebtn[name='enter']").click();
    if (keymap[16]) { // Shift est maintenu
        simulateMouseClick()
    }
}
if (keymap[88]&&keymap[16]) { // x --> intermed
    if (keymap[16]) { // Shift est maintenu
        if (!show_indicator_lines){
            action_indicator_lines()
        }
        simulateMouseClick()
    }
        }



        
        // Gestion Curseur d'annotation
        if (keymap[190] && e.ctrlKey) { // ; --> déplace le curseur à gauche de 1cm
            positionCurseur += 0.1;
            let meta = getMeta();
            plot_cursor( show_indicator_lines ? indicator_correction(positionCurseur): positionCurseur,meta)
        }
        if (keymap[190] && !e.ctrlKey) { // Ctrl + ; --> déplace le curseur à gauche de 10cm
            positionCurseur += 0.01;
            let meta = getMeta();
            plot_cursor(show_indicator_lines ? indicator_correction(positionCurseur): positionCurseur,meta)
        }
        if (keymap[223] && e.ctrlKey) { // ! --> déplace le curseur à droite de 1cm
            positionCurseur -= 0.1
            let meta = getMeta();
            plot_cursor(show_indicator_lines ? indicator_correction(positionCurseur): positionCurseur,meta)
        }
        if (keymap[223] && !e.ctrlKey) { // Ctrl + ! --> déplace le curseur à droite de 10cm
            positionCurseur -= 0.01;
            let meta = getMeta();
            plot_cursor(show_indicator_lines ? indicator_correction(positionCurseur): positionCurseur,meta)
        }
        if (keymap[191]) { // : --> click le curseur, place une annotation du mode sélectionné
            e.preventDefault()
            let vid = document.getElementById("vid");
            let meta = getMeta();
            let yPosition = getLaneYPosition(selected_swim, meta);
            annotate(show_indicator_lines ? indicator_correction(positionCurseur): positionCurseur,yPosition,selected_swim)

            let tid = curr_swims[selected_swim].findIndex(d => d.frame_number == parseInt(vid.currentTime * frame_rate) - parseInt(temp_start * frame_rate),) // = currate_events(curr_swims[selected_swim])
            edit_selected_cycle(tid);

            highlightCycle(selected_cycle)

            updateTable()
        }

        // Gestion du temps de la vidéo

        if (keymap[68] && e.ctrlKey) { // Ctrl + d --> Avance 
            e.preventDefault();
            $("#next-chk").trigger("click")
        }
        if (keymap[68] && !e.ctrlKey) { // d --> avance d'une frame la vidéo
            e.preventDefault();
            $("#next-frame").trigger("click");
        }
        if (keymap[81] && e.ctrlKey){ // Ctrl + q --> Avanve --
            e.preventDefault();
            $("#prev-chck").trigger("click")
        }
        if (keymap[81] && !e.ctrlKey) { // q --> recule d'une frame la vidéo
            e.preventDefault();
            $("#prev-frame").trigger("click")
        }
        if (keymap[32]) { // 'space' key --> Pause/Play
            e.preventDefault()
            $("#play").trigger("click")
        }

        // Afficher / cacher les labels
        if (keymap[74]) {  // j --> Afficher / cacher les labels
            e.preventDefault()
            $("#hidlab").trigger("click")
        }

        // Gestion des annotations
        if (keymap[46]) { // 'delete' key
            $("#del").trigger("click")
        }
    }
};

/**
 * @brief Modifie la position du curseur d'annotation
 * Setter pour la variable globale positionCurseur
 * 
 * @param {number} x Nouvelle position du curseur (0-50)
 */
export function edit_positionCurseur(x) {
    positionCurseur = x;
}

/**
 * @brief Modifie la position verticale de la vidéo
 * Setter pour la variable globale ttop
 * 
 * @param {number} x Nouvelle coordonnée Y
 */
export function edit_ttop(x){
    ttop = x;
}

/**
 * @brief Modifie la position horizontale de la vidéo
 * Setter pour la variable globale tleft
 * 
 * @param {number} x Nouvelle coordonnée X
 */
export function edit_tleft(x){
    tleft = x;
}
