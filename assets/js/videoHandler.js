/**
 * @file videoHandler.js
 * @brief fonctions principales de la lecture vidéo.
 */

import { edit_scaleZoom,flipper } from "./refactor-script.js";
import { ttop,tleft, edit_tleft, edit_ttop } from "./shortcuts_handler.js";
import { moveVideoSurfaceTo, resetVideoSurfaceTransform } from "./video_surface.js";
// Variables lié à l'affichage de la vidéo
let tevx;
let tevy;

/**
 * @brief Démarre le processus de déplacement de la vidéo (drag start)
 * Enregistre la position initiale de la vidéo et de la souris pour le calcul de déplacement
 * 
 * @param {Event} event Événement de souris contenant les coordonnées initiales
 */
export function vidStart(event) {

    const elem = $(this);
    let left = elem.css("left").substring(0, elem.css("left").length - 2);
    let top = elem.css("top").substring(0, elem.css("top").length - 2);
    edit_tleft(parseFloat(left));
    edit_ttop(parseFloat(top));
    tevx = event.x;
    tevy = event.y;
}

/**
 * @brief Gère le déplacement continu de la vidéo (drag move)
 * Calcule la nouvelle position en fonction du mouvement de la souris
 * 
 * @param {Event} event Événement de souris avec les nouvelles coordonnées
 */
export function vidDrag(event) {
    moveVid($(this),tleft + event.x - tevx,ttop + event.y - tevy)
}

/**
 * @brief Déplace physiquement l'élément vidéo à une nouvelle position
 * Applique les nouvelles coordonnées CSS à l'élément vidéo si aucune annotation n'est sélectionnée
 * 
 * @param {jQuery} elem Élément jQuery de la vidéo à déplacer
 * @param {number} deplX Nouvelle position X en pixels
 * @param {number} deplY Nouvelle position Y en pixels
 */
export function moveVid(elem,deplX,deplY){
    if (!flipper) {
        moveVideoSurfaceTo(deplX, deplY)
    }
}

/**
 * @brief Remet la vidéo à sa position et zoom par défaut
 * Réinitialise la position (0,0) et le zoom (échelle 1) de l'élément vidéo
 */
export function vidReset() {

    edit_scaleZoom(1);
    resetVideoSurfaceTransform();
}
window.vidReset = vidReset;
