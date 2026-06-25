/**
 * @file refractor-script.js
 * @brief ce fichier fait le lien entre les éléments html et leurs fonctions, c'est ici quelles sont attribuées.
 */

import { choose_tab,construct_modify_selected_annotation_table, add_element_to_data,vide_last_added_data, last_added_data, currate_events, construct_last_added_data_table } from './data_handler.js';
import { findVideoByType, meters_checkpoints,megaData,curr_swims, frame_rate, compets, getDatas, selected_comp, load_run, turn_distances, turn_times, selected_run, edit_vidName, vidName, getRuns, get_quality, get_temp_start, pool_size, n_camera, getLaneYPosition, resolveRunName, getRunDisplayParts, videoMatchesType, applyRaceSettings, getConfiguredSwimmerCount, getSwimmerName } from './loader.js';
import { construct_time_entry, draw_stats, set_placeholder_of_time_entry, update_swimmer } from './side_views.js';
import { displaySwimmers, updateTable, setGrad,frameId_to_RunTime } from './main.js';
import { activate_shortcut,deactivate_shortcut, nageurs } from './jquery-custom.js';
import { getPointInverted,getPoolBar, eucDistance, get_orr } from './homography_handler.js';
import { getMeta, getSize,update_url } from './utils.js';
import { get_last_checkpoint, get_meter_plot_label,highlightCycle, mode_color, edit_lab_flipper,lab_flipper, resetHigh, update_cycle_rapide, updateBarsFromEvent } from './cycles_handler.js';
import { indicator_correction, show_indicator_lines, plot_indicator_lines, hide_indicator_lines,action_indicator_lines } from './plot_handler.js';
import { positionCurseur,edit_positionCurseur } from './shortcuts_handler.js'
import { vidReset } from './videoHandler.js';
import { getVideoDisplayTransform, redrawVideoSurface, refreshVideoSurface, zoomVideoSurface } from './video_surface.js';
import { dataProvider } from './aquanote-providers.js';
import { getSportsdataSaveFormatId } from './local_api.js';
import { cleanupExtraSwimmers, getExpectedTurns, getExpectedTurnDistances, getNextTurnDistance as getExpectedNextTurnDistance, hasValidCalibration, isValidSwimmerId, normalizeAnnotations, normalizeNumberOfSwimmers, validateAnnotationDistances, validateRaceConfig, validateSwimmerCountEvents, recalculateCycleMetrics, interpolateDistanceFromAnchors } from './race_distance.js';
import { displayRunPart } from './display_labels.js';
import { calculateAdvancedAnalysis, renderAdvancedAnalysis, exportAdvancedAnalysisCsv } from './advanced_analysis.js';


export let video_volume = 0;
export let selected_swim =3;
export let selected_num = 0;// Numéro du cycle séléctionné
export let vue_du_dessus = false; // Boolean correspondant à : est-ce qu'on a séléctionné la vue du dessus ?
let actual_side;//indique quelle est la vidéo actuellement affichée (droite ou gauche)
let min = 0;
let sec;
let ms = 0;
let video_speed = 1;
let tempval = "";// Valeur temporaire utilisée pour la selection du jeux de donnée "data"
let play_bool = false;// play/pause de la vidéo
export let last_checkpoint = 0;
var vid = document.getElementById("vid");
export const zoom_step = 5;// Quand on zoom : scaleZoom += (step / 100)
export let selected_data = ''// nom du fichier csv chargé en donnée (ex :2021_GT_Nice_brasse_50_finaleA_dames_Espadon.csv)
export let selected_cycle; // int, numéro du cycle séléctionné
export let temp_start = 0; //instant de la vidéo oùla course démarre.
export let displayMode = "0" // Mode d'affichage des annotations : 0 -> all, 1 -> swimmer séléctionné, 2 -> dernière annotation, 3 -> rien
export let scaleZoom = 1// Correspond au zoom dans la vidéo
export let mode = "cycle"// Modifié dans les boutons de classe modebtn (enter : fin de vol, end : fin de coulée, cycle : cycle, section : temps intermédiaire, respi : respirations, turn : demi-tour, finish : fin)
export let flipper = false;// Boolean correspondant à : est-ce qu'on a séléctionné une annotation ?
const codeNaNforDownload = "";// Lors du téléchargement des données, si une donnée est NaN, elle sera remplacé par codeNaNforDownload
let normalization_in_progress = false;
//choose_right_plot({"checked":false});
choose_tab(null,"data_entry",'side_tab_content','sideTabLinks')
construct_modify_selected_annotation_table(true)

function videoUrl(filename, time = null) {
    const url = dataProvider.getVideoUrl(selected_comp, selected_run, filename);
    return time == null ? url : `${url}#t=${Math.max(0, time)}`;
}

function videoMetaByNamePart(namePart) {
    return findVideoByType(megaData[0]?.videos, namePart);
}

function currentVideoMatches(typeVideo) {
    const src = vid?.currentSrc || vid?.getAttribute("src") || "";
    const meta = megaData[0]?.videos?.find((video) => video.name && src.includes(video.name));
    return meta ? videoMatchesType(meta, typeVideo) : src.includes(typeVideo);
}

function syncRefactorGlobals() {
    if (typeof window === "undefined") {
        return;
    }
    window.temp_start = temp_start;
    window.displayMode = displayMode;
    window.selected_swim = selected_swim;
}

syncRefactorGlobals();

function formatPlaybackSpeed(value) {
    const number = Number(value);
    return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function setRangeFill(elem, value) {
    const minValue = Number(elem.attr("min") ?? 0);
    const maxValue = Number(elem.attr("max") ?? 1);
    const percent = maxValue > minValue
        ? Math.max(0, Math.min(100, ((value - minValue) / (maxValue - minValue)) * 100))
        : 0;

    elem.css('background',
        'linear-gradient(to right,'
        + 'rgba(11, 99, 206, 1) 0%, '
        + 'rgba(11, 99, 206, 1) ' + percent + '%, '
        + '#FFF ' + (percent + 0.01) + '%, '
        + '#FFF 100%) '
    );
}

function setPlaybackSpeed(value) {
    const speedControl = $("#poolop");
    const minValue = Number(speedControl.attr("min") ?? 0.1);
    const maxValue = Number(speedControl.attr("max") ?? 2);
    const numericValue = Number(value);
    const nextSpeed = Number.isFinite(numericValue)
        ? Math.max(minValue, Math.min(maxValue, numericValue))
        : 1;

    video_speed = nextSpeed;
    const videoElement = document.getElementById('vid');
    if (videoElement) {
        videoElement.playbackRate = video_speed;
    }
    speedControl.val(String(video_speed));
    $("#speed").html("x" + formatPlaybackSpeed(video_speed));
    setRangeFill(speedControl, video_speed);
}

function seekToRaceStart() {
    const videoElement = document.getElementById("vid");
    if (!videoElement || !Number.isFinite(temp_start)) {
        return;
    }

    const wasPlaying = !videoElement.paused;
    const raceStart = Math.max(0, temp_start);
    videoElement.currentTime = raceStart;
    last_checkpoint = 0;

    const timebar = $("#timebar");
    if (Number.isFinite(videoElement.duration) && videoElement.duration > 0) {
        const percent = raceStart * 100 / videoElement.duration;
        timebar.val(percent);
        setGrad(percent / 100);
    } else {
        setGrad(0);
    }

    $(".crop_can").remove();
    $(".div_can").remove();
    updateBarsFromEvent(selected_swim, true);

    const rangeV = document.getElementById('nodule');
    if (rangeV) {
        rangeV.innerHTML = `<span>${sec_to_timestr(0)}s</span>`;
    }
    if (wasPlaying) {
        videoElement.play();
    }
}

function eventToVideoNormalizedPoint(event, meta) {
    const container = document.getElementById("video");
    const transform = getVideoDisplayTransform(meta);
    const [sourceWidth, sourceHeight] = getSize(meta);
    if (!container || !transform || !sourceWidth || !sourceHeight) {
        return null;
    }

    const bounds = container.getBoundingClientRect();
    const scaleX = bounds.width > 0 ? container.offsetWidth / bounds.width : 1;
    const scaleY = bounds.height > 0 ? container.offsetHeight / bounds.height : 1;
    const localX = (event.clientX - bounds.left) * scaleX;
    const localY = (event.clientY - bounds.top) * scaleY;
    const sourceX = (localX - transform.x) / transform.k;
    const sourceY = (localY - transform.y) / transform.k;

    if (
        sourceX < 0 ||
        sourceY < 0 ||
        sourceX > sourceWidth ||
        sourceY > sourceHeight
    ) {
        return null;
    }

    return [sourceX / sourceWidth, sourceY / sourceHeight];
}

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

export function clampSelectedSwim(laneCount) {
    if (laneCount <= 0) {
        selected_swim = 0;
        syncRefactorGlobals();
        return;
    }
    selected_swim = Math.max(0, Math.min(selected_swim, laneCount - 1));
    syncRefactorGlobals();
}

    document.querySelectorAll(".__range-step").forEach(function (ctrl) {
        let el = ctrl.querySelector('input');
        let output = ctrl.querySelector('output');

        el.oninput = function () {
            // colorize step options
            ctrl.querySelectorAll("option").forEach(function (opt) {
                if (opt.value <= el.valueAsNumber)
                    opt.style.backgroundColor = '#0b63ce';
                else
                    opt.style.backgroundColor = '#aaa';
            });
            // colorize before and after
            let valPercent = (el.valueAsNumber - parseInt(el.min)) / (parseInt(el.max) - parseInt(el.min));
            let style = 'background-image: -webkit-gradient(linear, 0% 0%, 100% 0%, color-stop(' +
                valPercent + ', #0b63ce), color-stop(' +
                valPercent + ', #aaa));width:160px';
            el.style = style;

            // Popup
            if ((' ' + ctrl.className + ' ').indexOf(' ' + '__range-step-popup' + ' ') > -1) {
                let selectedOpt = ctrl.querySelector('option[value="' + el.value + '"]');
                output.innerText = selectedOpt.text;
                output.style.left = "50%";
                output.style.left = ((selectedOpt.offsetLeft + selectedOpt.offsetWidth / 2) - output.offsetWidth / 2) + 'px';
            }
        };
        el.oninput();
    });


    $("#temp").on("focus", function () {
        deactivate_shortcut();
        let elem = $("#temp")
        tempval = elem.val()
    })

    $("#temp").on("focusout", function () {
        activate_shortcut();
        let elem = $("#temp")
        let t = elem.val()
        if (t == "") {
            elem.val(tempval)
        }
        tempval = ""
    })

    $("#kmod").on("input", function () {
        displayMode = $(this).val();
        syncRefactorGlobals();
        updateBarsFromEvent(selected_swim, true);
    })


    $("#hidlab").on("click", function () {
        edit_lab_flipper(!lab_flipper);
        updateBarsFromEvent(selected_swim, true);
        if (lab_flipper) {
            $(this).html("Hide text")
        } else {
            $(this).html("Show text")
        }
    })

    $(".modebtn").on("click", function () {

        $(".modebtn.selected").removeClass("selected")
        let elem = $(this)

        let name = elem.attr("name")

        elem.addClass("selected")

        mode = name
    })

    $("#play").on("click", () => {

        
        play_bool = !play_bool;
        if (play_bool) {
            vid.play();
            $("#play").attr("src", "assets/images/controls/pause-sign.svg");
        } else {
            $("#play").attr("src", "assets/images/controls/play-sign.svg");
            vid.pause();
        }
    });

    

    $("#quality").on("change",() =>{
        edit_vidName( $('#quality').val());
        let vid = document.getElementById("vid")
        let metaDroite = videoMetaByNamePart("fixeDroite")
        let metaGauche = videoMetaByNamePart("fixeGauche")
        if (!metaDroite || !metaGauche) {
            vid.setAttribute("src", videoUrl(vidName, vid.currentTime));
            refreshVideoSurface(getMeta());
            return;
        }

        let right_attr = "start_flash"
        let left_attr = "start_synchro_flash"
        if (metaDroite["start_side"] === "left") {
            right_attr = "start_synchro_flash"
            left_attr = "start_flash"
        }

        let right_val = Number(metaDroite[right_attr]) || 0;
        let left_val = Number(metaGauche[left_attr]) || 0;

        if (currentVideoMatches("fixeDroite")) {

            let t = vid.currentTime - right_val + left_val
            vid.setAttribute("src", videoUrl(vidName, t))
            setGrad(t)
        } else {
            let t = vid.currentTime - right_val + left_val
            vid.setAttribute("src", videoUrl(vidName, t))
            setGrad(t)
        }
        refreshVideoSurface(getMeta());
        updateBarsFromEvent(selected_swim, true);
        if (flipper)
            highlightCycle(selected_swim, selected_cycle)

        // On doit réafficher les lignes indicatrices si elle était déjà affiché :
        if(show_indicator_lines){
            // On supprimer les anciennes
            plot_indicator_lines(false)
            // On réaffiche les lignes indicatrices
            plot_indicator_lines(true)
        }
    })
    $("#vidsw").on("click", () => {
        if (n_camera > 1) {
            let vid = document.getElementById("vid")
            let metaDroite = videoMetaByNamePart("fixeDroite")
            let metaGauche = videoMetaByNamePart("fixeGauche")
            if (!metaDroite || !metaGauche) {
                return;
            }

            let right_attr = "start_flash"
            let left_attr = "start_synchro_flash"
            if (metaDroite["start_side"] === "left") {
                right_attr = "start_synchro_flash"
                left_attr = "start_flash"
            }

            let right_val = Number(metaDroite[right_attr]) || 0;
            let left_val = Number(metaGauche[left_attr]) || 0;

            if (currentVideoMatches("fixeDroite")) {
                let t = vid.currentTime + right_val - left_val
                edit_vidName(metaGauche.name);
                vid.setAttribute("src", videoUrl(metaGauche.name, t))
                setGrad(t)
            } else {
                let t = vid.currentTime - right_val + left_val
                edit_vidName(metaDroite.name);
                vid.setAttribute("src", videoUrl(metaDroite.name, t))
                setGrad(t)
            }
            refreshVideoSurface(getMeta());
            updateBarsFromEvent(selected_swim, true); //
            if (flipper)
                highlightCycle(selected_swim, selected_cycle)

            // On doit réafficher les lignes indicatrices si elle était déjà affiché :
            if(show_indicator_lines){
                plot_indicator_lines(false)
                plot_indicator_lines(true)
            }
            document.getElementById('vid').playbackRate = video_speed;
            document.getElementById('vid').volume = video_volume;
            vidReset();
        }
    })
    $("#vid_dessus").on("click", () => {
        let vid = document.getElementById("vid")
        if (currentVideoMatches("dessus")) {
                let t = 0
                const sideMeta = videoMetaByNamePart("fixeGauche") || videoMetaByNamePart("fixeDroite") || megaData[0]?.videos?.[0];
                if (sideMeta?.name) {
                    edit_vidName(sideMeta.name);
                    vid.setAttribute("src", videoUrl(sideMeta.name, t))
                }
                setGrad(t)
                vue_du_dessus = false;
            } else {
                let t = 0
                let metaDessus = videoMetaByNamePart("dessus");
                if (metaDessus?.name) {
                    edit_vidName(metaDessus.name);
                    vid.setAttribute("src", videoUrl(metaDessus.name, t));
                    setGrad(t)
                    vue_du_dessus = true;
                }
            }
        refreshVideoSurface(getMeta());
        updateBarsFromEvent(selected_swim, true); //
            if (flipper)
                highlightCycle(selected_swim, selected_cycle)

            // On doit réafficher les lignes indicatrices si elle était déjà affiché :
            if(show_indicator_lines){
                plot_indicator_lines(false)
                plot_indicator_lines(true)
            }
            document.getElementById('vid').playbackRate = video_speed;
            document.getElementById('vid').volume = video_volume;
            vidReset();
    })

    $("#quality").on("click",() =>{
        if (currentVideoMatches("fixeDroite")) {
            actual_side = "droite"
        }
        if (currentVideoMatches("fixeGauche")) {
            actual_side = "gauche"
        }
        get_quality(selected_comp, selected_run,actual_side)
    })

    $("#next-chk").on("click", () => {
        
        let vid = document.getElementById("vid");
        vid.currentTime += 1    
    })

    $("#race-start").on("click", seekToRaceStart)

    $("#next-frame").on("click", () => {

        var vid = document.getElementById("vid");
        vid.currentTime += 1/frame_rate
    })

    $("#prev-frame").on("click", () => {

        var vid = document.getElementById("vid");
        vid.currentTime -= 1/frame_rate
    })

    $("#prev-chck").on("click", () => {

        var vid = document.getElementById("vid");
        vid.currentTime -= 1;
    })

    $("#competition").on("change", async function () {
        let val = $(this).val()
        await getRuns(val)

    })

    $("#run").on("input", async function () {

        let val = $(this).val()
        await getDatas($("#competition").val(), val)
    })

    $("#loadbtn").on("click", async function () {
        const selected_comp = $("#competition").val();
        const runToLoad = get_run_selected();
        const knownRuns = compets[selected_comp];
        if (knownRuns?.length > 0 && !knownRuns.some(run => run.name === runToLoad)) {
            alert(`The race "${runToLoad}" does not exist.`);
            return;
        }
        $(".crop_can").remove();
        $(".swname_pool").remove();

        const selectedTempBeforeRefresh = $("#temp").val();
        await getDatas(selected_comp, runToLoad);
        if (selectedTempBeforeRefresh && selectedTempBeforeRefresh !== "new_data") {
            const stillExists = $("#temp option").toArray().some((option) => option.value === selectedTempBeforeRefresh);
            if (stillExists) {
                $("#temp").val(selectedTempBeforeRefresh);
            }
        }
        const temp = $("#temp").val();
        selected_data = (temp === "new_data" ? '' : temp);
        await load_run(runToLoad, selected_data);
        sync_race_settings_panel();
        normalize_current_annotations({ showAlert: false });
        update_url();
    });
    $("#run_part1").on("change", function () {
        const selectedTypeNage = $(this).val(); // Récupérer la valeur sélectionnée dans run_part1
        const selectedComp = $("#competition").val(); // Récupérer la compétition sélectionnée
    
        // Vérifier si une compétition est sélectionnée
        if (!selectedComp || !compets[selectedComp]) {
            console.error("No valid competition selected.");
            return;
        }
    
        const matchingRuns = compets[selectedComp]
            .filter(run => getRunDisplayParts(run.name, selectedComp)[0] === selectedTypeNage);

        // Filtrer les options pour run_part2
        const filteredSexeNageurs = matchingRuns
            .map(run => getRunDisplayParts(run.name, selectedComp)[1]) // Extraire le sexe
            .filter((value, index, self) => value && self.indexOf(value) === index); // Supprimer les doublons
    
        fillDropdown("run_part2", filteredSexeNageurs);
    
        // Vider les menus suivants
        let filteredDistances = matchingRuns
            .map(run => getRunDisplayParts(run.name, selectedComp)[2]) // Extraire la distance
            .filter((value, index, self) => value && self.indexOf(value) === index); // Supprimer les doublons
        filteredDistances = Array.from(filteredDistances).sort((a, b) => parseInt(a) - parseInt(b));
        fillDropdown("run_part3", filteredDistances);
        const filteredEtapes = matchingRuns
            .map(run => getRunDisplayParts(run.name, selectedComp)[3]) // Extraire l'étape
            .filter((value, index, self) => value && self.indexOf(value) === index); // Supprimer les doublons
        
        fillDropdown("run_part4", filteredEtapes);
        refreshDatasForCurrentRun();
    });
    
    $("#run_part2").on("change", function () {
        const selectedTypeNage = $("#run_part1").val();
        const selectedSexeNageur = $(this).val();
        const selectedComp = $("#competition").val();
    
        if (!selectedComp || !compets[selectedComp]) {
            console.error("No valid competition selected.");
            return;
        }
    
        const matchingRuns = compets[selectedComp]
            .filter(run => {
                const parts = getRunDisplayParts(run.name, selectedComp);
                return parts[0] === selectedTypeNage && parts[1] === selectedSexeNageur;
            });

        // Filtrer les options pour run_part3
        let filteredDistances = matchingRuns
            .map(run => getRunDisplayParts(run.name, selectedComp)[2]) // Extraire la distance
            .filter((value, index, self) => value && self.indexOf(value) === index); // Supprimer les doublons
        filteredDistances = Array.from(filteredDistances).sort((a, b) => parseInt(a) - parseInt(b));
        fillDropdown("run_part3", filteredDistances);
    
        // Vider les menus suivants
        const filteredEtapes = matchingRuns
            .map(run => getRunDisplayParts(run.name, selectedComp)[3]) // Extraire l'étape
            .filter((value, index, self) => value && self.indexOf(value) === index); // Supprimer les doublons
    
        fillDropdown("run_part4", filteredEtapes);
        refreshDatasForCurrentRun();
    });
    
    $("#run_part3").on("change", function () {
        const selectedTypeNage = $("#run_part1").val();
        const selectedSexeNageur = $("#run_part2").val();
        const selectedDistance = $(this).val();
        const selectedComp = $("#competition").val();
    
        if (!selectedComp || !compets[selectedComp]) {
            console.error("No valid competition selected.");
            return;
        }
    
        // Filtrer les options pour run_part4
        const filteredEtapes = compets[selectedComp]
            .filter(run => {
                const parts = getRunDisplayParts(run.name, selectedComp);
                return parts[0] === selectedTypeNage && parts[1] === selectedSexeNageur && parts[2] === selectedDistance;
            })
            .map(run => getRunDisplayParts(run.name, selectedComp)[3]) // Extraire l'étape
            .filter((value, index, self) => value && self.indexOf(value) === index); // Supprimer les doublons
    
        fillDropdown("run_part4", filteredEtapes);
        refreshDatasForCurrentRun();
    });
    $("#run_part4").on("change", function () {
        const part1 = $("#run_part1").val();
        const part2 = $("#run_part2").val();
        const part3 = $("#run_part3").val();

        // Vérifier si une course peut être résolue
        if (part1 || part2 || part3) {
            getDatas($("#competition").val(), get_run_selected());
        }
    });

    function refreshDatasForCurrentRun() {
        const part1 = $("#run_part1").val();
        const part2 = $("#run_part2").val();
        const part3 = $("#run_part3").val();
        const part4 = $("#run_part4").val();
        if (part1 || part2 || part3 || part4) {
            getDatas($("#competition").val(), get_run_selected());
        }
    }
    
    function fillDropdown(dropdownId, options) {
        const dropdown = $(`#${dropdownId}`);
        dropdown.empty(); // Vider les options existantes
    
        // Ajouter les nouvelles options
        options.forEach(option => {
            dropdown.append(`<option value="${option}">${displayRunPart(option)}</option>`);
        });
        if (options.length > 0) {
            dropdown.val(options[0]);
        }
    }

    /**
     * Method used to generate the report related to the current run
     */
    export function generateRunReport(){
        let url = dataProvider.getVideoUrl(selected_comp, selected_run, $("#temp").val())
        // let lien = window.location.href.match(/[0-9]+_[^&]+/g)
        let lien = "https://observablehq.com/d/9dbe52f370657ce8?s="+url
        window.open(lien,'_blank')
    }
    window.generateRunReport = generateRunReport;
    $("#pathToReport").on("click",function() {
        let url = dataProvider.getVideoUrl(selected_comp, selected_run, $("#temp").val())
        // let lien = window.location.href.match(/[0-9]+_[^&]+/g)
        let lien = "https://observablehq.com/d/9dbe52f370657ce8?s="+url
        window.open(lien,'_blank')
    })


    $("body").on("click", ".cycleDots", function () {
        let elem = $(this)
        let id = elem.attr("num")
        selected_cycle = id
        highlightCycle(selected_swim, selected_cycle)
    })

    $("body").on("click", "rect", function () {

        let elem = $(this)

        let id = elem.attr("num")
        selected_cycle = id
        selected_swim = parseInt(elem.attr("swim"))
        updateSwimSwitch()

        highlightCycle(selected_swim, selected_cycle)

    })

    $("#volume_range").on("input",function(){
        let elem = $("#volume_range")
        let val = parseFloat(elem.val())
        let val2 = val + 0.0001

        video_volume = val
        document.getElementById('vid').volume = video_volume

        let volume_plot = "🔊"
        if(val <= 0.0001){
            volume_plot = "🔇";
        }else if(val < 1/3.0){
            volume_plot = "🔈";
        }else if(val < 2/3.0){
            volume_plot = "🔉";
        }

        $("#volume").html(volume_plot)

        elem.css('background',
            'linear-gradient(to right,'
            + 'rgba(11, 99, 206, 1) 0%, '
            + 'rgba(11, 99, 206, 1) ' + (val * 100) + '%, '
            + '#FFF ' + (val2 * 100) + '%, '
            + '#FFF 100%) '
        )
    });

    $("#poolop").on("input", function () {
        let elem = $("#poolop")
        setPlaybackSpeed(parseFloat(elem.val()));
    })

    setPlaybackSpeed($("#poolop").val());

    $("#cyclebar").on("mouseover", "rect", function () {

        let elem = d3.select(this);
        highlightCycle(elem.attr("swim"), elem.attr("num"))
    })

    $("#cyclebar").on("mouseout", "rect", function () {
        resetHigh()
    })

    $("#cycle_stats").on("mouseover", "rect", function () {

        let elem = d3.select(this);
        highlightCycle(selected_swim, elem.attr("num"))
    })

    $("#cycle_stats").on("mouseout", "rect", function () {
        resetHigh()
    })

    $("#stats").on("mouseover", "circle", function () {

        let elem = d3.select(this);
        highlightCycle(selected_swim, elem.attr("num"))
    })

    $("#stats").on("mouseout", "circle", function () {
        resetHigh()
    })

    $("body").on("input", "#swim_switch", function () {

        const requestedSwimmer = parseInt($(this).val());
        selected_swim = isValidSwimmerId(requestedSwimmer, get_number_of_swimmers()) ? requestedSwimmer : 0;
        $(this).val(selected_swim);
        update_swimmer(selected_swim)
        updateTable();
        $(".crop_can").remove()
        $(".div_can").remove()
        updateBarsFromEvent(selected_swim, true);
        set_placeholder_of_time_entry();
    })

    $("#video").on("click", ".crop_can", function () {
        var vid = document.getElementById("vid");

        let elem = d3.select(this);
        flipper = true;
        vid.style.cursor = "pointer"
        selected_swim = parseInt(elem.attr("swim"))
        //updateSwimSwitch()
        selected_num = elem.attr("num")
        let data=curr_swims[selected_swim].filter(d=>d.event!=="reaction");
        selected_cycle = parseInt(selected_num)

        vid.currentTime = temp_start + data[selected_cycle].frame_number / frame_rate;
        update_swimmer(selected_swim)
        highlightCycle(elem.attr("swim"), elem.attr("num"))
        construct_modify_selected_annotation_table(false)
    })
    $("#video").on("click", async function (e) {clic_souris_video(e)})
    //TODO: REPLACE FOR CLICK
export function clic_souris_video(e) {
    var vid = document.getElementById("vid");
    if (e.target == vid) {
        //let vid = document.getElementById("vid");

        let meta = getMeta();
        if (flipper) {
            resetHigh()
            flipper = false;
            construct_modify_selected_annotation_table(true)
            vid.style.cursor = "crosshair";
            updateBarsFromEvent(selected_swim, true);
        } else {
            const normalizedPoint = eventToVideoNormalizedPoint(e, meta);
            if (!normalizedPoint) {
                return;
            }
            let pt = getPointInverted(normalizedPoint, meta)
            
            let trx_scale = d3.scaleLinear([0, 960], [pool_size[0], 0]);
            let meters_plot_label = (show_indicator_lines ? indicator_correction(trx_scale(pt[0])):trx_scale(pt[0]));
            if (meters_plot_label < 0 || meters_plot_label > pool_size[0] || isNaN(meters_plot_label) || isNaN(pt[1])) {
                return;
            }
            let yPosition = getLaneYPosition(selected_swim, meta);
            annotate(meters_plot_label,yPosition,selected_swim);
        }
        let tid = curr_swims[selected_swim].findIndex(d => d.frame_number == parseInt(vid.currentTime * frame_rate) - parseInt(temp_start * frame_rate),) // = currate_events(curr_swims[selected_swim])
        selected_cycle = tid

        highlightCycle(selected_cycle)

        //TODO: select current cycle in the re-order
        
        updateTable()
        
    }
}

    function get_race_distance_m(){
        const metaDistance = Number(megaData?.[0]?.raceDistanceM ?? megaData?.[0]?.distance);
        if (Number.isFinite(metaDistance) && metaDistance > 0) return metaDistance;
        const lastTurnDistance = Number(turn_distances?.[turn_distances.length - 1]);
        return Number.isFinite(lastTurnDistance) && lastTurnDistance > 0 ? lastTurnDistance : pool_size[0];
    }

    function get_pool_length_m(){
        const metaPoolLength = Number(megaData?.[0]?.poolLengthM ?? megaData?.[0]?.taille_piscine?.[0]);
        return Number.isFinite(metaPoolLength) && metaPoolLength > 0 ? metaPoolLength : pool_size[0];
    }

    function get_distance_mode(){
        return megaData?.[0]?.distanceMode || (megaData?.[0]?.distanceCalibration ? "calibrated" : "interpolated");
    }

    function get_number_of_swimmers(){
        return getConfiguredSwimmerCount(megaData?.[0]);
    }

    function cleanup_curr_swims_to_configured_count(){
        const numberOfSwimmers = get_number_of_swimmers();
        for (const key of Object.keys(curr_swims)) {
            const swimmerId = Number(key);
            if (!isValidSwimmerId(swimmerId, numberOfSwimmers)) {
                delete curr_swims[key];
                delete turn_times[key];
            }
        }
        for (let i = 0; i < numberOfSwimmers; i++) {
            if (!curr_swims[i]) curr_swims[i] = [];
            if (!turn_times[i]) turn_times[i] = {};
        }
        if (!isValidSwimmerId(selected_swim, numberOfSwimmers)) {
            selected_swim = 0;
            syncRefactorGlobals();
        }
    }

    function cleanup_extra_swimmers_click(){
        const before = Object.keys(curr_swims).length;
        cleanup_curr_swims_to_configured_count();
        const after = Object.keys(curr_swims).length;
        $("#swim_switch").html("");
        displaySwimmers(megaData[0]["lignes"]);
        updateSwimSwitch();
        updateTable();
        draw_stats(curr_swims[selected_swim] || []);
        update_annotation_status({ status: `cleaned ${Math.max(0, before - after)} extra swimmer lanes` });
    }

    function get_race_config(){
        return {
            raceDistanceM: get_race_distance_m(),
            poolLengthM: get_pool_length_m(),
            numberOfSwimmers: get_number_of_swimmers(),
            raceStartVideoTime: Number(megaData?.[0]?.raceStartVideoTime ?? temp_start),
            distanceMode: get_distance_mode(),
            distanceCalibration: megaData?.[0]?.distanceCalibration,
            frameRate: frame_rate,
        };
    }

    function rebuild_turn_times_from_curr_swims(){
        for (const key of Object.keys(turn_times)) {
            turn_times[key] = {};
        }
        for (const swimId of Object.keys(curr_swims)) {
            turn_times[swimId] = {};
            for (const event of curr_swims[swimId] || []) {
                if (["reaction", "turn", "finish"].includes(event.mode)) {
                    turn_times[swimId][event.cumul] = Number(event.frameId) / frame_rate;
                }
            }
        }
    }

    function normalize_current_annotations({ showAlert = true } = {}){
        if (normalization_in_progress) return { events: Object.values(curr_swims).flat(), warnings: [] };
        normalization_in_progress = true;
        try {
            const allEvents = Object.values(curr_swims).flat();
            const result = normalizeAnnotations(allEvents, get_race_config());
            cleanup_curr_swims_to_configured_count();
            for (const key of Object.keys(curr_swims)) {
                curr_swims[key] = [];
            }
            for (const event of result.events) {
                const swimId = Number(event.swimmerId ?? event.swimmer);
                if (!isValidSwimmerId(swimId, get_number_of_swimmers())) continue;
                if (!curr_swims[swimId]) curr_swims[swimId] = [];
                event.swimmer = swimId;
                event.swimmerId = swimId;
                event.frame_number = event.frameId;
                event.cumul = Number(event.cumul);
                curr_swims[swimId].push(event);
            }
            for (const key of Object.keys(curr_swims)) {
                curr_swims[key] = currate_events(curr_swims[key]);
            }
            console.table((curr_swims[selected_swim] || []).map(event => ({
                mode: event.mode,
                raceTime: (Number(event.frameId) / frame_rate).toFixed(2),
                cumul: Number(event.cumul).toFixed(2),
                source: event.distanceSource || "",
            })));
            if (megaData?.[0]) {
                megaData[0].raceStartVideoTime = result.raceStartVideoTime;
            }
            edit_temp_start(result.raceStartVideoTime);
            rebuild_turn_times_from_curr_swims();
            updateTable();
            draw_stats(curr_swims[selected_swim] || []);
            updateBarsFromEvent(selected_swim, true);
            set_placeholder_of_time_entry();
            update_annotation_status({
                status: result.warnings.length ? `normalized with ${result.warnings.length} warning(s)` : "normalized valid"
            });
            if (showAlert && result.warnings.length > 0) {
                alert("Normalize CSV warnings:\n" + result.warnings.slice(0, 16).join("\n"));
            }
            return result;
        } finally {
            normalization_in_progress = false;
        }
    }

    export function normalize_before_table_render(){
        if (normalization_in_progress) return;
        normalize_current_annotations({ showAlert: false });
    }
    if (typeof window !== "undefined") {
        window.normalize_before_table_render = normalize_before_table_render;
    }

    function get_current_frame_id(vid){
        return parseInt(vid.currentTime * frame_rate) - parseInt(temp_start * frame_rate);
    }

    function pool_x_from_cumulative_distance(distance){
        const poolLength = get_pool_length_m();
        return poolLength * (parseInt(distance / poolLength) % 2);
    }

    function get_next_turn_distance(id_swim, frameId){
        const poolLength = get_pool_length_m();
        const raceDistance = get_race_distance_m();
        const existingTurns = (curr_swims[id_swim] || [])
            .filter(d => d.mode === "turn" && d.frameId <= frameId)
        return getExpectedNextTurnDistance(existingTurns, raceDistance, poolLength);
    }

    function update_annotation_status(details = {}){
        const panel = document.getElementById("annotation-status");
        const vid = document.getElementById("vid");
        if (!panel || !vid) return;
        const raceDistance = get_race_distance_m();
        const poolLength = get_pool_length_m();
        const numberOfSwimmers = get_number_of_swimmers();
        const expectedTurns = getExpectedTurns(raceDistance, poolLength);
        const expectedTurnDistances = getExpectedTurnDistances(raceDistance, poolLength);
        const frameId = details.frameId ?? get_current_frame_id(vid);
        const raceTime = frameId / frame_rate;
        const clicked = details.rawClick
            ? `${Number(details.rawClick.x).toFixed(2)}, ${Number(details.rawClick.y).toFixed(2)}`
            : "--";
        panel.innerHTML = `
            <strong>Annotation status</strong>
            <span>Race distance: ${raceDistance} m</span>
            <span>Pool length: ${poolLength} m</span>
            <span>Stroke: ${megaData?.[0]?.strokeType ?? megaData?.[0]?.nage ?? "freestyle"}</span>
            <span>Swimmers: ${numberOfSwimmers}</span>
            <span>Expected turns: ${expectedTurns}</span>
            <span>Turn distances: ${expectedTurnDistances.length ? expectedTurnDistances.join("m, ") + "m" : "none"}</span>
            <span>Video time: ${sec_to_timestr(vid.currentTime.toFixed(3))}</span>
            <span>Race start: ${sec_to_timestr(Number(temp_start).toFixed(3))}</span>
            <span>Race time: ${sec_to_timestr(Math.max(0, raceTime).toFixed(3))}</span>
            <span>Event: ${details.mode ?? mode}</span>
            <span>Raw click: ${clicked}</span>
            <span>Distance: ${details.distance !== undefined ? Number(details.distance).toFixed(2) + " m" : "--"}</span>
            <span>Source: ${details.source ?? "--"}</span>
            <span>Status: ${details.status ?? "waiting"}</span>
        `;
    }

    function sync_race_settings_panel(){
        const raceDistance = get_race_distance_m();
        const poolLength = get_pool_length_m();
        const strokeType = megaData?.[0]?.strokeType ?? megaData?.[0]?.nage ?? "freestyle";
        const distanceMode = get_distance_mode();
        const raceInput = document.getElementById("raceDistanceM");
        const poolInput = document.getElementById("poolLengthM");
        const strokeInput = document.getElementById("strokeType");
        const modeInput = document.getElementById("distanceMode");
        const swimmerInput = document.getElementById("numberOfSwimmers");
        if (raceInput) raceInput.value = String(raceDistance);
        if (poolInput) poolInput.value = String(poolLength);
        if (strokeInput) strokeInput.value = String(strokeType);
        if (modeInput) modeInput.value = String(distanceMode);
        if (swimmerInput) swimmerInput.value = String(get_number_of_swimmers());
        const expectedTurns = getExpectedTurns(raceDistance, poolLength);
        const expectedTurnDistances = getExpectedTurnDistances(raceDistance, poolLength);
        const expectedTurnsDisplay = document.getElementById("expectedTurnsDisplay");
        const expectedTurnDistancesDisplay = document.getElementById("expectedTurnDistancesDisplay");
        if (expectedTurnsDisplay) expectedTurnsDisplay.textContent = `Expected turns: ${expectedTurns}`;
        if (expectedTurnDistancesDisplay) {
            expectedTurnDistancesDisplay.textContent = `Turn distances: ${expectedTurnDistances.length ? expectedTurnDistances.join("m, ") + "m" : "none"}`;
        }
        update_annotation_status();
    }

    function apply_race_settings_from_panel(){
        const raceDistance = Number(document.getElementById("raceDistanceM")?.value || 100);
        const poolLength = Number(document.getElementById("poolLengthM")?.value || 25);
        const strokeType = document.getElementById("strokeType")?.value || "freestyle";
        const distanceMode = document.getElementById("distanceMode")?.value || "interpolated";
        const numberOfSwimmers = normalizeNumberOfSwimmers(document.getElementById("numberOfSwimmers")?.value || 1);
        const warnings = validateRaceConfig(raceDistance, poolLength);
        if (distanceMode === "calibrated" && !hasValidCalibration(megaData?.[0]?.distanceCalibration)) {
            warnings.push("Calibrated mode requires valid calibration. Falling back to interpolated mode.");
        }
        applyRaceSettings({
            raceDistanceM: raceDistance,
            poolLengthM: poolLength,
            strokeType,
            distanceMode,
            numberOfSwimmers,
        });
        cleanup_curr_swims_to_configured_count();
        $("#swim_switch").html("");
        displaySwimmers(megaData[0]["lignes"]);
        if (warnings.length > 0) {
            alert("Race settings warning:\n" + warnings.join("\n"));
        }
        sync_race_settings_panel();
        if (curr_swims[selected_swim]) {
            construct_time_entry();
            set_placeholder_of_time_entry();
            update_cycle_rapide();
        }
    }

    function get_distance_for_annotation(mode_annotation, xPosition, id_swim, frameId){
        const raceDistance = get_race_distance_m();
        if (mode_annotation === "reaction") {
            return { distance: 0, source: "race start" };
        }
        if (mode_annotation === "finish") {
            return { distance: raceDistance, source: "race distance config" };
        }
        if (mode_annotation === "turn") {
            const turnDistance = get_next_turn_distance(id_swim, frameId);
            if (turnDistance === null) {
                return { distance: null, source: "snapped pool multiple", status: "No more turns before finish. Use Finish." };
            }
            return { distance: turnDistance, source: "snapped pool multiple" };
        }
        const clickedDistance = get_meter_plot_label(xPosition);
        if ((mode_annotation === "cycle" || mode_annotation === "dolphin") && get_distance_mode() === "manual") {
            const manualDistance = Number(prompt("Enter cumulative race distance in meters:", clickedDistance.toFixed(2)));
            return {
                distance: Number.isFinite(manualDistance) ? Math.max(0, Math.min(raceDistance, manualDistance)) : clickedDistance,
                source: "manual"
            };
        }
        const needsInterpolatedEstimate = (get_distance_mode() === "interpolated")
            || (get_distance_mode() === "calibrated" && !hasValidCalibration(megaData?.[0]?.distanceCalibration));
        if ((mode_annotation === "cycle" || mode_annotation === "dolphin") && needsInterpolatedEstimate) {
            const frameDistance = interpolateDistanceFromAnchors({ frameId, cumul: clickedDistance }, curr_swims[id_swim] || [], raceDistance);
            return {
                distance: Math.max(0, Math.min(raceDistance, frameDistance)),
                source: get_distance_mode() === "calibrated" ? "interpolated fallback" : "interpolated"
            };
        }
        return {
            distance: Math.max(0, Math.min(raceDistance, clickedDistance)),
            source: megaData?.[0]?.distanceCalibration ? "calibrated click" : "interpolated/click estimate"
        };
    }

    function validate_new_annotation(id_swim, frameId, distance, mode_annotation){
        if (frameId < 0) return "Race time is negative";
        const previous = (curr_swims[id_swim] || [])
            .filter(d => d.frameId <= frameId)
            .sort((a, b) => b.frameId - a.frameId)[0];
        if (previous && Number(distance) < Number(previous.cumul) && !["respi", "end", "section", "dolphin"].includes(mode_annotation)) {
            return "Warning: distance is lower than the previous annotation";
        }
        return "valid";
    }

    function add_annotation_at_current_time(mode_annotation, id_swim = selected_swim, xPosition = null, yPosition = null){
        const vid = document.getElementById("vid");
        if (!vid) return false;
        const frameId = get_current_frame_id(vid);
        if (frameId < 0 || (frameId === 0 && mode_annotation !== "reaction")) {
            alert("Annotation should start when the run begins !");
            update_annotation_status({ mode: mode_annotation, frameId, status: "invalid: before race start" });
            return false;
        }

        let annotationX = xPosition;
        let annotationY = yPosition;
        const meta = getMeta();
        if (annotationY === null || annotationY === undefined) {
            annotationY = meta ? getLaneYPosition(id_swim, meta) : null;
        }

        const distanceInfo = get_distance_for_annotation(mode_annotation, annotationX ?? 0, id_swim, frameId);
        if (distanceInfo.distance === null) {
            alert(distanceInfo.status);
            update_annotation_status({ mode: mode_annotation, frameId, source: distanceInfo.source, status: distanceInfo.status });
            return false;
        }
        if (annotationX === null || annotationX === undefined || mode_annotation === "turn" || mode_annotation === "finish" || mode_annotation === "reaction") {
            annotationX = pool_x_from_cumulative_distance(distanceInfo.distance);
        }

        const status = validate_new_annotation(id_swim, frameId, distanceInfo.distance, mode_annotation);
        add_element_to_data({
            "frame_number": frameId,
            "frameId": frameId,
            "x": annotationX,
            "y": annotationY,
            "swimmer": id_swim,
            "mode": mode_annotation,
            "cumul": distanceInfo.distance
        }, id_swim)

        if (["reaction", "turn", "finish"].includes(mode_annotation)) {
            turn_times[id_swim][distanceInfo.distance] = frameId / frame_rate;
            set_placeholder_of_time_entry();
        }
        update_annotation_status({
            mode: mode_annotation,
            frameId,
            rawClick: xPosition !== null && xPosition !== undefined ? { x: xPosition, y: yPosition } : null,
            distance: distanceInfo.distance,
            source: distanceInfo.source,
            status
        });
        normalize_current_annotations({ showAlert: false });
        return true;
    }

    function set_race_start_at_current_time(){
        const vid = document.getElementById("vid");
        if (!vid) return;
        const oldTempStart = Number(temp_start) || 0;
        const newTempStart = Number(vid.currentTime) || 0;
        const frameShift = parseInt((oldTempStart - newTempStart) * frame_rate);
        edit_temp_start(vid.currentTime);
        if (megaData?.[0]) {
            megaData[0].raceStartVideoTime = vid.currentTime;
        }
        for (const swimId of Object.keys(curr_swims)) {
            curr_swims[swimId] = (curr_swims[swimId] || []).map(event => {
                if (event.mode !== "reaction") {
                    event.frameId = Math.max(0, Number(event.frameId) + frameShift);
                    event.frame_number = Math.max(0, Number(event.frame_number) + frameShift);
                }
                return event;
            });
            curr_swims[swimId] = currate_events(curr_swims[swimId]);
            turn_times[swimId] = {};
            for (const event of curr_swims[swimId]) {
                if (["reaction", "turn", "finish"].includes(event.mode)) {
                    turn_times[swimId][event.cumul] = event.frameId / frame_rate;
                }
            }
        }
        $('#editStartTime').attr('value', sec_to_timestr(temp_start));
        const existingReaction = (curr_swims[selected_swim] || []).find(d => d.mode === "reaction");
        if (existingReaction) {
            existingReaction.frameId = 0;
            existingReaction.frame_number = 0;
            existingReaction.x = pool_x_from_cumulative_distance(0);
            existingReaction.cumul = 0;
            curr_swims[selected_swim] = currate_events(curr_swims[selected_swim]);
        } else {
            add_annotation_at_current_time("reaction");
        }
        turn_times[selected_swim][0] = 0;
        setGrad(vid.currentTime / vid.duration);
        set_placeholder_of_time_entry();
        update_annotation_status({ mode: "reaction", frameId: 0, distance: 0, source: "race start", status: "valid" });
        normalize_current_annotations({ showAlert: false });
    }

    function validate_annotations_before_download(){
        const warnings = [];
        const raceDistance = get_race_distance_m();
        const poolLength = get_pool_length_m();
        const numberOfSwimmers = get_number_of_swimmers();
        for (const swimId of Object.keys(curr_swims)) {
            if (!isValidSwimmerId(Number(swimId), numberOfSwimmers)) {
                warnings.push(`Swimmer ${Number(swimId) + 1}: swimmerId outside configured range.`);
                continue;
            }
            const events = (curr_swims[swimId] || []).slice().sort((a, b) => a.frameId - b.frameId);
            if (events.length === 0) continue;
            validateSwimmerCountEvents(events, numberOfSwimmers)
                .forEach(warning => warnings.push(`Swimmer ${Number(swimId) + 1}: ${warning}`));
            validateAnnotationDistances(events, raceDistance, poolLength)
                .forEach(warning => warnings.push(`Swimmer ${Number(swimId) + 1}: ${warning}`));
        }
        if (warnings.length > 0) {
            alert("Annotation validation warnings:\n" + warnings.slice(0, 12).join("\n"));
        }
        return warnings;
    }

    function normalize_csv_click(){
        normalize_current_annotations({ showAlert: true });
    }

    function validate_button_click(){
        normalize_current_annotations({ showAlert: true });
        validate_annotations_before_download();
    }

    export function annotate(xPosition,yPosition,id_swim){
        add_annotation_at_current_time(mode, id_swim, xPosition, yPosition);
    }

    $("#vid").on("timeupdate", function () {
        let elem = $("#timebar");
        let vid = document.getElementById("vid");

        let tdat = megaData[1].filter(d => d.frame_number === parseInt((vid.currentTime - temp_start) * frame_rate))

        if (tdat.length > 0) {

            let avg = tdat.map(d => d.x).reduce((a, b) => (a + b)) / tdat.length

            if (avg > (pool_size[0] / 2) - 3 && !currentVideoMatches("fixeGauche")) { //TODO: Adapt to start side

                let metaLeft = videoMetaByNamePart("fixeGauche")
                if (!metaLeft?.name) return;
                temp_start = get_temp_start(metaLeft);


                edit_vidName(metaLeft.name);
                vid.setAttribute("src", videoUrl(metaLeft.name))
                refreshVideoSurface(metaLeft);
                vid.currentTime = temp_start + tdat[0].frame_number / frame_rate;
                selected_num = curr_swims[selected_swim].length - 1;

                if (play_bool) vid.play()

                updateBarsFromEvent(selected_swim, true);

            } else if (avg < (pool_size[0] / 2) - 3 && !currentVideoMatches("fixeDroite")) { //TODO: Adapt to start side

                let metaRight = videoMetaByNamePart("fixeDroite");
                if (!metaRight?.name) return;
                temp_start = get_temp_start(metaRight);

                edit_vidName(metaRight.name);
                vid.setAttribute("src", videoUrl(metaRight.name))
                refreshVideoSurface(metaRight);
                vid.currentTime = temp_start + tdat[0].frame_number / frame_rate;
                selected_num = 0
                updateBarsFromEvent(selected_swim, true);
            }
        }

        let tval = (vid.currentTime / vid.duration) * 100;
        if (!isNaN(tval)) {
            elem.val(tval)
            setGrad((tval / 100))
        } else {
            setGrad(0)
        }
        let memo = last_checkpoint
        last_checkpoint = (get_last_checkpoint(meters_checkpoints, parseInt((vid.currentTime - temp_start)*frame_rate)))
        if( memo != last_checkpoint){
            if(show_indicator_lines){
                // On supprimer les anciennes
                plot_indicator_lines(false)
                // On réaffiche les lignes indicatrices
                plot_indicator_lines(true)
            }
            $(".crop_can").remove()
            $(".div_can").remove()
            updateBarsFromEvent(selected_swim, true);
        }
        let rangeV = document.getElementById('nodule')
        rangeV.innerHTML = `<span>${sec_to_timestr((vid.currentTime - temp_start).toFixed(3))}s</span>`;
        update_annotation_status();
    })

    $("#vid").on("loadedmetadata", function () {
        this.playbackRate = video_speed;
    })

    $("#timebar").on("input", function () {
        let elem = $("#timebar");
        let vid = document.getElementById("vid")

        vid.currentTime = vid.duration * (elem.val() / 100)

        let memo = last_checkpoint
        last_checkpoint = (get_last_checkpoint(meters_checkpoints, parseInt((vid.currentTime - temp_start)*frame_rate)))
        if(memo != last_checkpoint){
            if(show_indicator_lines){
                // On supprime les anciennes
                plot_indicator_lines(false)
                // On réaffiche les lignes indicatrices
                plot_indicator_lines(true)
            }
            $(".crop_can").remove()
            $(".div_can").remove()
            updateBarsFromEvent(selected_swim, true);
        }
        setGrad((elem.val() / 100))
        let rangeV = document.getElementById('nodule')
        rangeV.innerHTML = `<span>${sec_to_timestr((vid.currentTime - temp_start).toFixed(3))}</span>`;
        update_annotation_status();
    })

    $("#keyframes").on("mouseover", ".keyhold", function () {
        let elem = $(this);
        highlightCycle(elem.attr("swim"), elem.attr("num"))
    })
    
    $("#keyframes").on("mouseout", ".keyhold", function () {
        resetHigh()
    })

    $("#download").on("click", function () {
        normalize_current_annotations({ showAlert: false });
        validate_annotations_before_download();
        const trackingHead = ["frameId", "swimmerId", "swimmerName", "lane", "cumul", "eventId", "eventX", "eventY", "event", "TempsVideo (s)", "Temps (s)", "distance (m)", "tempo (s)", "frequence (cylce/min)", "amplitude (m)", "vitesse (m/s)"];
        const basicTrackingHead = ["frameId", "swimmerId", "eventId", "time", "distance"];
        let rows = []
        cleanup_curr_swims_to_configured_count();
        let swims = Object.keys(curr_swims).filter(swimId => isValidSwimmerId(Number(swimId), get_number_of_swimmers()))
        for (let i = 0; i < swims.length; i++) {
            const swimId = Number(swims[i]);
            recalculateCycleMetrics(curr_swims[swimId], frame_rate);
            for (let j = 0; j < curr_swims[swimId].length; j++) {
                let r = curr_swims[swimId][j]

                let nageur = getSwimmerName(megaData?.[0], swimId);
                let lane = "ligne" + (swimId + 1)
                let eventRow = r["mode"]
                let distanceRow = r["cumul"].toFixed(2)
                let tempsVideo = (parseFloat(frameId_to_RunTime(r["frame_number"]))+parseFloat(temp_start))
                let tempsRow = frameId_to_RunTime(r["frame_number"]);
                let eventXRow = Number.isFinite(Number(r["x"])) ? Number(r["x"]).toFixed(4) : "";
                let eventYRow = Number.isFinite(Number(r["y"])) ? Number(r["y"]) : "";

                if (r["mode"] === "cycle" || r["mode"] === "dolphin") {
                    rows.push([
                        r["frame_number"], (swimId), nageur, lane, distanceRow, eventRow, eventXRow, eventYRow,
                        eventRow, tempsVideo, tempsRow, distanceRow,
                        r["tempo (s)"] ?? "",
                        r["frequence (cylce/min)"] ?? "",
                        r["amplitude (m)"] ?? "",
                        r["vitesse (m/s)"] ?? ""
                    ])
                } else {
                    rows.push([r["frame_number"], (swimId), nageur, lane, distanceRow, eventRow, eventXRow, eventYRow, eventRow, tempsVideo, tempsRow, distanceRow])
                }

            }
        }

        let head = trackingHead;
        if (getSportsdataSaveFormatId() === "formats.csv.swimming-basic-tracking") {
            rows = rows.map(row => [
                row[0],
                row[1],
                row[8],
                row[10],
                row[11]
            ]);
            head = basicTrackingHead;
        }

        let csvContent = "data:text/csv;charset=utf-8,"
            + head.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n");


        let encodedUri = encodeURI(csvContent);
        let link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", $("#temp").val());
        document.body.appendChild(link); 

        link.click();
    })

    
    $("#del").on("click", function () {

        
        let last_added_data_index = last_added_data.indexOf(curr_swims[selected_swim][selected_cycle])
        if(last_added_data_index >= 0){
            last_added_data.splice(last_added_data_index,1);
        }
        curr_swims[selected_swim].splice(selected_cycle, 1);
        curr_swims[selected_swim] = currate_events(curr_swims[selected_swim])

        updateBarsFromEvent(selected_swim);
        draw_stats(curr_swims[selected_swim])
        updateTable()

        flipper = false
        construct_last_added_data_table()
        construct_modify_selected_annotation_table(true)}
    )

    $("#right-m").on("click", function () {

       
        let valueDeplacement = parseFloat(document.getElementById("deplacementCorrection").value)/100;
        curr_swims[selected_swim][selected_cycle].x -= valueDeplacement

        update_cycle_rapide()
    })

    $("#left-m").on("click", function () {
        
        let valueDeplacement = parseFloat(document.getElementById("deplacementCorrection").value)/100;
        curr_swims[selected_swim][selected_cycle].x += valueDeplacement
        update_cycle_rapide()
    })

    

export function focus_time_input(){
    deactivate_shortcut();
}

export function focusout_time_input(e){
    activate_shortcut();
    let entry = e.currentTarget
    let entry_value = entry.value
    if(entry_value != ""){
        [min,sec,ms] = timestr_to_min_sec_ms(entry_value)
        e.currentTarget.value = min+":"+sec+"."+ms
    }
}



    /**
     * Transforme une chaîne de caractère comprenant min:sec.ms en une version normalisée et vérifiée
     * Ex : "01:1.23" en min = "01" sec = "01" ms = "23"
     * Ex : pasUnNombre:10.toto en min = "00" sec = "10" ms = "00"
     * Ex : "72.234" en min = "01" sec = "12" ms = "234"
     * Ex : 120 en min = "00" sec = "01" ms = "20"
     *
     * @param {str} timestr the input string
     * @return {array} [min,sec,ms] minute, second, precise sec
     */
    export function timestr_to_min_sec_ms(timestr){
        let spl_min_secms = timestr.split(":");
        let secms = spl_min_secms[0];
        if (spl_min_secms.length > 1){
            min = spl_min_secms[0];
            secms = spl_min_secms[1];
        }
        let spl_sec_ms = secms.split(".");
        let sec = spl_sec_ms[0];
        if(spl_sec_ms.length > 1){
            ms = spl_sec_ms[1];
        }else{
            let elm = spl_sec_ms[0]
            ms = (isNaN(elm[elm.length-2]) ? "0" : elm[elm.length-2]) + (isNaN(elm[elm.length-1]) ? "0" : elm[elm.length-1])
            sec = (isNaN(elm[elm.length-4]) ? "0" : elm[elm.length-4]) + (isNaN(elm[elm.length-3]) ? "0" : elm[elm.length-3])
            min = (isNaN(elm[elm.length-6]) ? "0" : elm[elm.length-6]) + (isNaN(elm[elm.length-5]) ? "0" : elm[elm.length-5])
        }

        min = isNaN(min) ? 0 : (parseInt(Math.abs(min)))
        sec = isNaN(sec) ? 0 : (parseInt(Math.abs(sec)))

        min = (min+Math.floor(sec/60)).toString();
        sec = (sec%60).toString();

        ms = isNaN(ms) ? "0" : ms
        
        if(min.length <= 1){
            min = ("0"+min).substr(("0"+min).length-2)
        }

        sec = ("0"+sec).substr(("0"+sec).length-2)
        if(ms.length <= 1){
            ms = (ms+"0").substr((ms+"0").length-2)
        }
        return [min,sec,ms]
    }

    /**
     * Transforme min:sec.ms en une valeur totale de secondes
     * Ex :  min = "01" sec = "02" ms = "23" en 62.23
     * Devrait être utiliser avec timestr_to_min_sec_ms
     *
     * @param {array} [min,sec,ms] minute, second, precise sec
     * @return {number} total_sec nombre total de secondes
     */
    export function min_sec_ms_to_sec([min,sec,ms]){
        min = parseInt(min)
        sec = parseInt(sec)
        ms = parseFloat("0."+ms)
        return min*60+sec+1.0*ms
    }

    export function sec_to_timestr(secondes){
        min = Math.floor(Math.abs(secondes) / 60.0)
        min = ("0"+min.toString()).substr(("0"+min.toString()).length-2)

        sec = Math.floor(Math.abs(secondes) % 60.0)
        sec = ("0"+sec.toString()).substr(("0"+sec.toString()).length-2)

        ms = (Math.abs(secondes).toString()).split(".")
        if(ms.length > 1){
            ms = ms[1]
        }else{
            ms = 0
        }
        ms = (ms+"0").substring(2,0)
        let signe = ""
        if(secondes < 0){
            signe += "-"
        }
        return signe+min+":"+sec+"."+ms
    }

    $('#video').bind('wheel', function (e) {
        e.preventDefault()

        let vid = document.getElementById("video");
        let bounds = document.getElementById("vid-cont").getBoundingClientRect();
        let x = (e.clientX - bounds.left - (isNaN(parseFloat(vid.style["left"])) ? 0 : parseFloat(vid.style["left"])) ) - vid.offsetWidth/2.0
        let y = (e.clientY - bounds.top - (isNaN(parseFloat(vid.style["top"])) ? 0 : parseFloat(vid.style["top"])) ) - vid.offsetHeight/2.0
        
        if (e.originalEvent.wheelDelta / 120 > 0) { //ZOOM IN
            // if (scaleZoom < 6.8) { // arbitrary cap of zoom
            //     scaleZoom += (zoom_step / 100)
            //     // TODO: un-comment to release the aimed zoom
            //     // let bx = e.originalEvent.offsetX
            //     // let by = e.originalEvent.offsetY
            //     // d3.select("#video").transition().duration(75).style("transform-origin", (bx) + "px " + (by) + "px").style("transform", "scale(" + (scaleZoom) + ")")
            //     d3.select("#video").transition().duration(75).style("transform", "scale(" + (scaleZoom) + ")")
            // }
            
            zoom((zoom_step / 100),x,y)
        } else { // ZOOM out
            zoom(-(zoom_step / 100),x,y)
            // //TODO: un-comment to release the aimed zoom
            // let left = elem.css("left").substring(0, elem.css("left").length - 2)
            // let top = elem.css("top").substring(0, elem.css("top").length - 2)
            
            // let tleft = parseFloat(left)
            // let ttop = parseFloat(top)
            // elem.css("left", tleft * 0.9)
            // elem.css("top", ttop * 0.9)
        }
    });
let pt=[0,0];
    export function zoom(delta_zoom,deltaX=undefined,deltaY=undefined){
        const center = (deltaX !== undefined && deltaY !== undefined)
            ? { x: deltaX, y: deltaY }
            : undefined;
        scaleZoom = zoomVideoSurface(delta_zoom, center);
    }

    $("#video").on("mousemove", function (e) {
        let vid = document.getElementById("vid");
    
        if (!vid) {
            console.error("Element with ID 'vid' not found");
            return;
        }
    
        let meta=getMeta();
        if (!meta) {
            console.error("No matching video metadata found");
            return;
        }
    
        if (e.target == vid) {
            const normalizedPoint = eventToVideoNormalizedPoint(e, meta);
            if (!normalizedPoint) {
                $(".lin_mesure").remove();
                return;
            }
            pt = getPointInverted(normalizedPoint, meta);
        } //todo:get Offset stuff
        let trx_scale = d3.scaleLinear([0, 960], [pool_size[0], 0]);
        // On corrige la position de la ligne dans le cas où il y a des lignes indicatrices pour aider à une mesure précise
        let meters_plot_label = (show_indicator_lines ? indicator_correction(trx_scale(pt[0])):trx_scale(pt[0]));
        edit_positionCurseur( meters_plot_label);
        
        plot_cursor(positionCurseur, meta);
    });
    
    
    export function plot_cursor(cursor_position,meta){
        let vid = document.getElementById("vid");
        let container = document.getElementById("video")
        let [twidth, theight] = getSize(meta)
        let pts = getPoolBar(cursor_position, meta).reverse()

        if (cursor_position >= 0 && cursor_position <= pool_size[0]) {
            $(".lin_mesure").remove()

            let can = document.createElement("canvas");
            let context = can.getContext("2d")
            can.setAttribute("class", "line_can lin_mesure")

            let wscale = d3.scaleLinear([2.5, 2.5], [2.5, 2.5])
            can.width = wscale(scaleZoom)

            const displayStart = videoPointToDisplay(pts[0], meta);
            const displayEnd = videoPointToDisplay(pts[1], meta);
            const displayScale = displayStart?.k ?? (vid.offsetWidth / twidth);
            can.height = Math.max(1, Math.round(eucDistance(pts[0], pts[1]) * displayScale)) //+ 10
            let pointer_color = "#0b63ce" //"rgba(35, 33, 86, 0.2)"

            if(mode in mode_color){
                pointer_color = mode_color[mode]
            }
            context.fillStyle = pointer_color
            context.fillRect(0, 0, 50, 9999)

            let tpool_xscale = d3.scaleLinear([twidth, 0], [100, 0]);
            let tpool_yscale = d3.scaleLinear([0, theight], [0, 100]);
            can.style["top"] = displayStart ? `${displayStart.y}px` : (tpool_yscale(pts[0][1])) + "%";
            can.style["left"] = displayStart ? `${displayStart.x}px` : (tpool_xscale(pts[0][0])) + "%";
            can.style["transform"] = "rotate(" + get_orr(pts[1], pts[0]) + "deg)"
            container.append(can)

            let div = document.createElement("p");
            div.setAttribute("class", "line_can line_tool lin_mesure")
            div.innerText = (Math.round(get_meter_plot_label(cursor_position) * 100, 2) / 100) + " m"
            div.style["left"] = displayEnd ? `${displayEnd.x - 2.5 * displayScale}px` : (tpool_xscale(pts[1][0] - 2.5)) + "%";

            if (twidth === 2704) {
                div.style["top"] = displayEnd ? `${displayEnd.y + 3 * displayScale}px` : (tpool_yscale(pts[1][1]) + 3) + "%";
            } else {
                div.style["top"] = displayEnd ? `${displayEnd.y}px` : (tpool_yscale(pts[1][1])) + "%";
            }
            container.append(div)
        }
    }


    $("#vid").on("seeking", () => {
        $("#vid").css("opacity", "0.75")
        $("#vid-cont").attr("class", "loading")
    })

    $('#vid').on('canplay', () => {
        $("#vid-cont").attr("class", "")
        $("#vid").css("opacity", "1")
        redrawVideoSurface();
    })

    $("svg").on("click", "rect, circle", function () {
        let elem = d3.select(this);
        flipper = true;
        let vid = document.getElementById("vid")
        vid.style.cursor = "pointer"

        selected_swim = parseInt(elem.attr("swim"))
        updateSwimSwitch()
        selected_num = elem.attr("num")
        selected_cycle = parseInt(selected_num)
        vid.currentTime = temp_start + curr_swims[selected_swim][selected_cycle].frame_number / frame_rate
        construct_modify_selected_annotation_table(false)
    })
    document.getElementById("clr").addEventListener("click", function() {
        // Afficher une fenêtre de confirmation
        var confirmDelete = confirm("Are you sure you want to clear this lane?");
        
        if (confirmDelete) {
            // Si l'utilisateur confirme la suppression, vider les données de la nage sélectionnée
            curr_swims[selected_swim] = [];
            
            vide_last_added_data();
            
            // Mettre à jour l'affichage
            updateBarsFromEvent(selected_swim, true);
            draw_stats(curr_swims[selected_swim]);
            updateTable();
            
            // Réinitialiser le flipper
            flipper = false;
            
            // Reconstruire les tables de données
            construct_last_added_data_table();
            construct_modify_selected_annotation_table(true);
        }
        // Si l'utilisateur annule, rien ne se passe
    });

    function telech() {
                    
                    let message = "https://observablehq.com/@liris/nt-calibration-local?competition=" + selected_comp + "&course=" + get_run_selected();
                    
                    window.open(message, "_blank");
                }
    
    
    export function get_run_selected(){
        const selectedComp = $("#competition").val();
        const knownRuns = compets[selectedComp] || [];
        const hasKnownRun = (runName) => knownRuns.some(run => run.name === runName);

        const part1 = $("#run_part1").val();
        const part2 = $("#run_part2").val();
        const part3 = $("#run_part3").val();
        const part4 = $("#run_part4").val();

        // Vérifie d'abord si un paramètre 'course' est présent dans l'URL
        const urlParams = new URLSearchParams(window.location.search);
        const courseParam = resolveRunName(urlParams.get('course'));
        if (courseParam && courseParam.trim() !== "" && !part3 && hasKnownRun(courseParam)) {
            return courseParam;
        }

        // Sinon, comportement habituel
        const legacyRunName = resolveRunName(`${selectedComp}_${part1}_${part2}_${part3}_${part4}`);
        if (hasKnownRun(legacyRunName)) {
            return legacyRunName;
        }

        const matchingRun = knownRuns.find((run) => {
            const parts = getRunDisplayParts(run.name, selectedComp);
            return [part1, part2, part3, part4]
                .every((part, index) => !part || parts[index] === part);
        });
        return matchingRun?.name || selected_run || knownRuns[0]?.name || legacyRunName;
    }
    window.get_run_selected = get_run_selected;
    export function edit_temp_start(x){
        temp_start =x;
        syncRefactorGlobals();
    }
    export function edit_selected_cycle(x){
        selected_cycle=x;
    }
    export function edit_scaleZoom (x){
        scaleZoom = x;
    }
    export function edit_flipper(x){
        flipper = x;
    }
    export function edit_selected_num(x){
        selected_num = x;
    }
    export function edit_vue_du_dessus(x){
        vue_du_dessus = x;
    }

    window.addEventListener('DOMContentLoaded', function() {
        // Remplace les onclick inline par des listeners JS
        document.getElementById('btn-reaction')?.addEventListener('click', function () {
            hide_indicator_lines();
            set_race_start_at_current_time();
        });
        document.getElementById('btn-enter')?.addEventListener('click', hide_indicator_lines);
        document.getElementById('btn-end')?.addEventListener('click', hide_indicator_lines);
        document.getElementById('btn-turn')?.addEventListener('click', function () {
            hide_indicator_lines();
            add_annotation_at_current_time("turn");
        });
        document.getElementById('btn-finish')?.addEventListener('click', function () {
            hide_indicator_lines();
            add_annotation_at_current_time("finish");
        });
        document.getElementById('btn-cycle')?.addEventListener('click', hide_indicator_lines);
        document.getElementById('btn-respi')?.addEventListener('click', hide_indicator_lines);
        document.getElementById('btn-dolphin')?.addEventListener('click', hide_indicator_lines);
        document.getElementById('ligneRef')?.addEventListener('click', action_indicator_lines);
        document.getElementById('raceDistanceM')?.addEventListener('change', apply_race_settings_from_panel);
        document.getElementById('poolLengthM')?.addEventListener('change', apply_race_settings_from_panel);
        document.getElementById('strokeType')?.addEventListener('change', apply_race_settings_from_panel);
        document.getElementById('distanceMode')?.addEventListener('change', apply_race_settings_from_panel);
        document.getElementById('numberOfSwimmers')?.addEventListener('change', apply_race_settings_from_panel);
        document.getElementById('cleanupExtraSwimmers')?.addEventListener('click', cleanup_extra_swimmers_click);
        document.getElementById('normalizeCsv')?.addEventListener('click', normalize_csv_click);
        document.getElementById('botn')?.addEventListener('click', validate_button_click);
        sync_race_settings_panel();
        document.getElementById('resetZoom')?.addEventListener('click', vidReset);
        document.getElementById('btn-report-run')?.addEventListener('click', generateRunReport);
        document.getElementById('telech')?.addEventListener('click', telech);
        document.getElementById('tab-data-entry')?.addEventListener('click', function(e) {
            choose_tab(e, 'data_entry','side_tab_content','sideTabLinks');
        });
        document.getElementById('tab-verification-charts')?.addEventListener('click', function(e) {
            choose_tab(e, 'verification_charts','side_tab_content','sideTabLinks');
        });
        document.getElementById('tab-data-plot-tout')?.addEventListener('click', function(e) {
            choose_tab(e, 'data_plot_tout','side_tab_content','sideTabLinks');
        });
        document.getElementById('tab-modify-selected-annotation')?.addEventListener('click', function(e) {
            choose_tab(e, 'modify_selected_annotation','side_tab_content','sideTabLinks');
        });
        document.getElementById('tab-generate-report')?.addEventListener('click', function(e) {
            choose_tab(e, 'generate_report','side_tab_content','sideTabLinks');
        });
        document.getElementById('tab-advanced-analysis')?.addEventListener('click', function(e) {
            choose_tab(e, 'advanced_analysis','side_tab_content','sideTabLinks');
        });
        document.getElementById('btn-advanced-analysis')?.addEventListener('click', function() {
            const events = curr_swims[selected_swim] || [];
            if (events.length === 0) return alert("No events to analyze.");
            const raceConfig = {
                raceDistanceM: Number(document.getElementById("raceDistanceM")?.value || 25),
                poolLengthM: Number(document.getElementById("poolLengthM")?.value || 25)
            };
            const analysis = calculateAdvancedAnalysis(events, raceConfig);
            renderAdvancedAnalysis(analysis, document.getElementById('advanced-analysis-container'));
        });
        document.getElementById('btn-convert-dolphin')?.addEventListener('click', function() {
            const events = curr_swims[selected_swim];
            if (!events || events.length === 0) return alert("No events found for selected swimmer.");
            
            let convertedCount = 0;
            const raceConfig = {
                raceDistanceM: Number(document.getElementById("raceDistanceM")?.value || 25),
                poolLengthM: Number(document.getElementById("poolLengthM")?.value || 25)
            };
            
            const anchors = events.filter(e => ["reaction", "turn"].includes(normalizeEventMode(e.mode || e.event || e.eventId))).sort((a, b) => Number(a["Temps (s)"]) - Number(b["Temps (s)"]));
            const breakouts = events.filter(e => ["breakout", "end", "finish"].includes(normalizeEventMode(e.mode || e.event || e.eventId))).sort((a, b) => Number(a["Temps (s)"]) - Number(b["Temps (s)"]));
            
            for (const anchor of anchors) {
                const phaseStart = Number(anchor["Temps (s)"]);
                const breakout = breakouts.find(b => Number(b["Temps (s)"]) > phaseStart);
                if (breakout) {
                    const phaseEnd = Number(breakout["Temps (s)"]);
                    events.forEach(e => {
                        const t = Number(e["Temps (s)"]);
                        if (normalizeEventMode(e.mode || e.event || e.eventId) === "cycle" && t > phaseStart && t < phaseEnd) {
                            e.mode = "dolphin";
                            if (e.event) e.event = "dolphin";
                            if (e.eventId) e.eventId = "dolphin";
                            delete e["tempo (s)"];
                            delete e["frequence (cylce/min)"];
                            delete e["amplitude (m)"];
                            delete e["vitesse (m/s)"];
                            convertedCount++;
                        }
                    });
                }
            }
            
            if (convertedCount > 0) {
                normalize_current_annotations({ showAlert: false });
                updateBarsFromEvent(selected_swim, true);
                draw_stats(curr_swims[selected_swim]);
                updateTable();
                alert("Successfully converted " + convertedCount + " underwater cycles to dolphin kicks.");
                document.getElementById('btn-advanced-analysis')?.click();
            } else {
                alert("No underwater cycles found to convert.");
            }
        });
        document.getElementById('btn-download-advanced')?.addEventListener('click', function() {
            const events = curr_swims[selected_swim] || [];
            if (events.length === 0) return alert("No events to export.");
            const raceConfig = {
                raceDistanceM: Number(document.getElementById("raceDistanceM")?.value || 25),
                poolLengthM: Number(document.getElementById("poolLengthM")?.value || 25)
            };
            const analysis = calculateAdvancedAnalysis(events, raceConfig);
            
            const eventSwimmerName = events.find(e => e.swimmerName)?.swimmerName;
            const swimmerName = eventSwimmerName || getSwimmerName(megaData?.[0], selected_swim) || "Unknown";
            
            const eventLane = events.find(e => e.lane)?.lane;
            const lane = eventLane || ("ligne" + (selected_swim + 1));
            
            exportAdvancedAnalysisCsv(analysis, swimmerName, lane);
        });
    });

    /**
     * @brief Synchronise l'affichage du sélecteur swim_switch avec la variable selected_swim
     * Met à jour la valeur et les classes CSS du sélecteur pour refléter le nageur sélectionné
     */
    export function updateSwimSwitch() {
        const swimSwitch = document.getElementById("swim_switch");
        if (swimSwitch) {
            swimSwitch.value = selected_swim;
            
            // Mettre à jour les classes CSS des options
            const options = swimSwitch.querySelectorAll('option');
            options.forEach((option) => {
                if (Number(option.value) === selected_swim) {
                    option.className = "swimmer-option selected";
                } else {
                    option.className = "swimmer-option";
                }
            });
            swimSwitch.dispatchEvent(new Event("change", { bubbles: true }));
        }
    }
