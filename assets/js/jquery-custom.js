/**
 * @file jquery-custom.js
 * @brief 
 */

import {  load_run} from './loader.js';













let  dialogStartTime, dialogReport, form
let allFields = $("#prefixName, #finalName, #prefixNameEdition, #finalNameEdition");
export let nageurs = []
export let shortcut_enabled = true;// Les raccourcis sont-ils activés ? (les raccourcis doivent être désactivé pour par exemple, l'entrée de données au clavier)

$("#fiches").selectmenu();



/**
 * @brief Gestionnaire de clic pour ouvrir le dialogue de rapport de nageur
 */
$("#btn-report-swimmer").on('click', () => dialogReport.dialog("open"))



/**
 * @brief Configuration du dialogue d'édition du temps de départ
 * Dialogue modal pour modifier le temps de départ de la course
 */
dialogStartTime = $("#dialog-startTime").dialog({
    autoOpen: false,
    height: 250,
    width: 450,
    modal: true,
    buttons: {
        Ok: function () {
            dialogStartTime.dialog("close");
        }
    },

    close: function () {
        form[0].reset();
        allFields.removeClass("ui-state-error");
    }
});





















/**
 * @brief Gestionnaire de clic sur le bouton d'édition du temps de départ
 * Ouvre le dialogue permettant de modifier le temps de départ de la course
 */
$('#editStartTime').on('click', function () {
    dialogStartTime.dialog("open")
})


/**
 * @brief Gestionnaire de perte de focus sur le champ d'édition du temps de départ
 * Recharge la course avec le nouveau temps de départ modifié
 */
$('#editStartTime').on('focusout', function () {
    let selectedRun = $("#run").val()
    let temp = $("#temp").val()
    let editedStartTime = $('#editStartTime').val()
    load_run(selectedRun, temp, editedStartTime)
})


/**
 * @brief Désactive les raccourcis clavier de l'application
 * Utilisé notamment lors de la saisie dans les champs de texte
 */
export function deactivate_shortcut (){
    shortcut_enabled=false;
}

/**
 * @brief Réactive les raccourcis clavier de l'application
 * Utilisé après la fin de saisie dans les champs de texte
 */
export function activate_shortcut (){
    shortcut_enabled=true;
}
