import {last_added_data } from "../../data_handler.js";
import { curr_swims } from "../../loader.js";
import { selected_swim } from "../../refactor-script.js";

export function normalizeInput(inputData, mean, std) {
    // inputData : tableau de features dans l'ordre attendu par le modèle
    // mean, std : tableaux de même taille (issus du JSON)
    if (inputData.length !== mean.length || mean.length !== std.length) {
        throw new Error("Les tailles de inputData, mean et std ne correspondent pas !");
    }
    return inputData.map((v, i) => (parseFloat(v) - parseFloat(mean[i])) / parseFloat(std[i]));
}

export function denormalizeOutput(normalizedValue, mean, std) {
    return Math.round(normalizedValue * std + mean);
}

function get_last_5_cycles() {
    // Utilise la table principale des cycles pour extraire les 5 derniers delta_t (en secondes)
    const rows = curr_swims[selected_swim] || [];
    // Filtrer uniquement les lignes de type "cycle"
    const cycleRows = rows.filter(r => (r.mode || '').startsWith('cycle'));
    if (cycleRows.length < 6) {
        // Pas assez de cycles pour calculer 5 delta_t
        return [-1, -1, -1, -1, -1];
    }
    // Prendre les 6 derniers cycles (pour 5 intervalles)
    const last6 = cycleRows.slice(-6);
    let delta_cycles = [];
    for (let i = 0; i < 5; i++) {
        let frame1 = parseFloat(last6[i + 1].frame_number);
        let frame2 = parseFloat(last6[i].frame_number);
        // On suppose que frame_number est croissant avec le temps
        delta_cycles.push((frame1 - frame2) / 50); // 50 fps
    }
    return delta_cycles;
}

export function prepareInputDataDos(){
    let input_features= get_last_5_cycles();
    let mean = input_features.reduce((a, b) => a + b, 0) / input_features.length;
    input_features.push($("#run_part2").val()== "hommes"? 1 : 0);
    input_features.push(last_added_data[0].cumul);
    input_features.push(mean);
    return(input_features);
}


export function countCyclesSinceLastTurn(poolLength) {
    // Récupère la table des cycles pour le nageur sélectionné
    const rows = curr_swims[selected_swim] || [];
    let lastTurnIndex = -1;
    for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        // On suppose que r.distance ou r["distance (m)"] existe
        let dist = parseFloat(r["distance (m)"] || r.distance || 0);
        let mode = r.mode || '';
        if (mode.startsWith("cycle")) {
            if (dist % poolLength === 0) {
                lastTurnIndex = i;
                break;
            }
        }
    }
    // Compte le nombre de cycles depuis ce virage
    let count = 0;
    for (let i = lastTurnIndex + 1; i < rows.length; i++) {
        let mode = rows[i].mode || '';
        if (mode.startsWith("cycle")) {
            count++;
        }
    }
    return count;
}

export function prepareInputDataFreestyle(){
    let input_features = get_last_5_cycles(); // 5 dernières valeurs delta_t
    // Ajout des features dans l'ordre du modèle 'freestyle' :
    // ["delta_t[-5]", "delta_t[-4]", "delta_t[-3]", "delta_t[-2]", "delta_t[-1]",
    //  "sexe", "distance (m)", "mean_even", "mean_odd", "alternance_flag", "alternance_pos"]
    //
    // Calcul mean_even et mean_odd
    let last5_frames = input_features.map(d => d * 50); // conversion en frames
    let even = last5_frames.filter((_, i) => i % 2 === 0);
    let odd = last5_frames.filter((_, i) => i % 2 === 1);
    let mean_even = even.length > 0 ? even.reduce((a, b) => a + b, 0) / even.length : 0;
    let mean_odd = odd.length > 0 ? odd.reduce((a, b) => a + b, 0) / odd.length : 0;
    // Alternance flag (même logique que Python)
    let seuil_diff = 5;
    let diff = Math.abs(mean_even - mean_odd);
    let alternance_flag = (diff > seuil_diff && diff < 50) ? 1 : 0;
    // Alternance pos
    let courts = last5_frames.filter(f => f < 60);
    let alternance_pos = -1;
    if (courts.length >= 2) {
        alternance_pos = (courts[courts.length - 1] < (courts.reduce((a, b) => a + b, 0) / courts.length)) ? 0 : 1;
    }
    // Sexe
    let sexe = $("#run_part2").val() == "hommes" ? 1 : 0;
    // Distance (m)
    let distance = last_added_data[0].cumul;
    // Construction finale dans l'ordre attendu
    input_features = [
        ...input_features,
        sexe,
        distance,
        mean_even,
        mean_odd,
        alternance_flag,
        alternance_pos,
    ];
    return input_features;
}