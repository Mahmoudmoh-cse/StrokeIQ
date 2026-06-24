/**
 * @file plot_handler.js
 * @brief fichier gèrant principalement l'affichage des barres de section.
 */
import { getLaneCount, getLaneKeysFromRaceMetadata, isOneIsUp, pool_size } from './loader.js';
import { scaleZoom,mode} from './refactor-script.js';
import { getPoolBar, get_orr, eucDistance } from './homography_handler.js';
import { get_meter_plot_label  } from './cycles_handler.js';
import { getMeta } from './utils.js';
import { getVideoDisplayTransform, setPoolControlsVisible, setPoolLaneOverlayVisible } from './video_surface.js';

export let show_indicator_lines = false;// Boolean correspondant au bouton Ligne Ref : true -> affichage et aide à la visée des lignes indicatrices, false -> pas d'affichage ni aide
export let show_pool_boundaries = false;// Boolean correspondant à l'affichage des limites de la piscine calibrées dans le JSON
export let show_pool_lanes = false;// Boolean correspondant à l'affichage des lignes de nage calibrées dans le JSON
let last_mode = "enter";// Dernier Mode d'annotation : quand on active les lignes ref on passe automatiquement en mode intermed, et quand on les désactive, on repasse en last_mode 
let ecart_bord_premiere_barre=5;
let ecart_barres=10;

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
 * @var ecart_bord_premiere_barre donne l'écart entre chaque barre
 */



/**
 * Fonction utilisée lors de l'appuis sur le bouton permettant l'affichage des lignes indicatrices
 */
export function action_indicator_lines(){
    show_indicator_lines = !show_indicator_lines;
    
    if(show_indicator_lines){
        document.getElementById("ligneRef").style.background = "#fff700";
        last_mode = mode
        $(".modebtn[name='section']").click()
    }else{
        document.getElementById("ligneRef").style.background = "#fff";
        $(".modebtn[name='"+last_mode+"']").click()
    }
    plot_indicator_lines(show_indicator_lines);
}
window.action_indicator_lines = action_indicator_lines;
/**
 * Fonction permettant d'effacer les lignes indicatrices lors du passage direct à un autre mode que section
 */
export function hide_indicator_lines(){
    if(show_indicator_lines){
        show_indicator_lines = !show_indicator_lines
        document.getElementById("ligneRef").style.background = "#fff";
        $(".line_ind").remove()
    }
}
window.hide_indicator_lines = hide_indicator_lines;

/**
 * Affiche ou effaces les lignes indicatrices
 *
 * @param {boolean} isPlot true --> Affiche, false --> efface
 */
import { getSize } from './utils.js';
export function plot_indicator_lines(isPlot){
    if (!isPlot){//$(".line_ind").length > 0
        $(".line_ind").remove()
    }else{
        if (pool_size[0]==25){
            ecart_barres=5;
        }
        else if (pool_size[0]==50){
            ecart_barres=10;
        }

        // Récupération des variables paramètre
        let vid = document.getElementById("vid");
        let container = document.getElementById("video")
        let meta = getMeta();
        let [twidth, theight] = getSize(meta)
        
        // Pour chaque distance on affiche une barre indicative :
        for(let i=0; i*ecart_barres+ecart_bord_premiere_barre<pool_size[0]; i++){
            let meter=i*ecart_barres+ecart_bord_premiere_barre
            let pts_ind = getPoolBar(meter,meta).reverse()
            let can = document.createElement("canvas");
            let context = can.getContext("2d")
            can.setAttribute("class", "line_can line_ind")

            let wscale = d3.scaleLinear([2.5, 2.5], [2.5, 2.5])
            can.width = wscale(scaleZoom)

            const displayStart = videoPointToDisplay(pts_ind[0], meta);
            const displayEnd = videoPointToDisplay(pts_ind[1], meta);
            const displayScale = displayStart?.k ?? (vid.offsetWidth / twidth);
            can.height = Math.max(1, Math.round(eucDistance(pts_ind[0], pts_ind[1]) * displayScale)) //+ 10 ici

            context.fillStyle = "rgba(255, 247, 0, 0.5)"
            context.fillRect(0, 0, 50, 9999)

            let tpool_xscale = d3.scaleLinear([twidth, 0], [100, 0]);
            let tpool_yscale = d3.scaleLinear([0, theight], [0, 100]);
            can.style["top"] = displayStart ? `${displayStart.y}px` : (tpool_yscale(pts_ind[0][1])) + "%";
            can.style["left"] = displayStart ? `${displayStart.x}px` : (tpool_xscale(pts_ind[0][0] )) + "%";

            can.style["transform"] = "rotate(" + get_orr(pts_ind[1], pts_ind[0]) + "deg)"
            container.append(can) 


            let div = document.createElement("p");
            div.setAttribute("class", "line_can line_tool line_ind")
            div.innerText = Math.round(get_meter_plot_label(meter)*100)/100 + " m"
            div.style["left"] = displayEnd ? `${displayEnd.x}px` : (tpool_xscale(pts_ind[1][0])) + "%";
            div.style["top"] = displayEnd ? `${displayEnd.y}px` : (tpool_yscale(pts_ind[1][1])) + "%";

            container.append(div)
        }
    }
}

export function plot_pool_boundaries(isPlot) {
    $(".pool_boundary_line").remove();

    if (!isPlot) {
        setPoolControlsVisible(false);
        return;
    }

    const annotateView = document.getElementById("annotate_view");
    const videoContainer = document.getElementById("video");
    if (annotateView?.hidden || !videoContainer || videoContainer.offsetWidth <= 0 || videoContainer.offsetHeight <= 0) {
        return;
    }

    let meta = null;
    try {
        meta = getMeta();
    } catch {
        return;
    }

    setPoolControlsVisible(true, meta);
}

function getPoolLaneOverlayOptions(meta) {
    const laneKeys = getLaneKeysFromRaceMetadata();
    const laneCount = Math.max(1, getLaneCount());
    const labels = laneKeys.map((laneKey, index) => ({
        label: String(index + 1),
        laneIndex: isOneIsUp(meta) ? index : laneCount - index - 1,
        laneKey
    }));

    return {
        laneCount,
        labels,
        poolSize: pool_size
    };
}

export function plot_pool_lanes(isPlot) {
    if (!isPlot) {
        setPoolLaneOverlayVisible(false);
        return;
    }

    const annotateView = document.getElementById("annotate_view");
    const videoContainer = document.getElementById("video");
    if (annotateView?.hidden || !videoContainer || videoContainer.offsetWidth <= 0 || videoContainer.offsetHeight <= 0) {
        return;
    }

    let meta = null;
    try {
        meta = getMeta();
    } catch {
        return;
    }

    setPoolLaneOverlayVisible(true, meta, getPoolLaneOverlayOptions(meta));
}

function syncPoolBoundariesToggle(checked) {
    show_pool_boundaries = checked;
    plot_pool_boundaries(show_pool_boundaries);
}

function syncPoolLanesToggle(checked) {
    show_pool_lanes = checked;
    plot_pool_lanes(show_pool_lanes);
}

function refreshVisiblePoolBoundaries() {
    if (!show_pool_boundaries && !show_pool_lanes) {
        return;
    }
    if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
            if (show_pool_boundaries) {
                plot_pool_boundaries(true);
            }
            if (show_pool_lanes) {
                plot_pool_lanes(true);
            }
        });
    } else {
        if (show_pool_boundaries) {
            plot_pool_boundaries(true);
        }
        if (show_pool_lanes) {
            plot_pool_lanes(true);
        }
    }
}

window.addEventListener('DOMContentLoaded', function() {
    const boundariesToggle = document.getElementById('show_pool_boundaries');
    boundariesToggle?.addEventListener('change', function(e) {
        syncPoolBoundariesToggle(e.target.checked);
    });
    const lanesToggle = document.getElementById('show_pool_lanes');
    lanesToggle?.addEventListener('change', function(e) {
        syncPoolLanesToggle(e.target.checked);
    });

    document.getElementById('vid')?.addEventListener('loadedmetadata', function() {
        refreshVisiblePoolBoundaries();
    });
    document.getElementById('vid')?.addEventListener('loadeddata', function() {
        refreshVisiblePoolBoundaries();
    });
    document.getElementById('vid')?.addEventListener('canplay', function() {
        refreshVisiblePoolBoundaries();
    });

    document.getElementById('vid')?.addEventListener('loadstart', function() {
        plot_pool_boundaries(false);
        plot_pool_lanes(false);
    });

    window.addEventListener('resize', function() {
        refreshVisiblePoolBoundaries();
    });

    window.addEventListener('workspace-layout-changed', function(e) {
        if (e.detail?.activeWorkspace === "annotate_view" || e.detail?.videoSize) {
            refreshVisiblePoolBoundaries();
        }
    });

    window.addEventListener('pool-calibration-updated', function() {
        refreshVisiblePoolBoundaries();
    });
});

/**
 * Corrige la position du curseur selon les lignes indicatrices :
 * Si les lignes indicatrices sont actives et que le curseur est à moins de 1 mètre d'une ligne indicatrice : le curseur s'y colle
 * On suppose que les lignes gardent un espace constant pour limiter l'information à transmettre
 * @param {number} x Position x dans la piscine du curseur
 * @return {number} Position corrigée x dans la piscine du curseur
 */



export function indicator_correction(x){
    let y=x-ecart_bord_premiere_barre;
    let max=pool_size[0]-ecart_bord_premiere_barre-1;
    let min =-1;
    if (y>min && y<max && (y%ecart_barres<1 || y%ecart_barres>ecart_barres-1)){
        if (y%ecart_barres<1 && y%ecart_barres>0 && ecart_barres>ecart_bord_premiere_barre)
            x= ~~(x/ecart_barres)*ecart_barres+ecart_bord_premiere_barre;
        else if (y%ecart_barres<1 && y%ecart_barres>0 )
            x= ~~(x/ecart_barres)*ecart_barres+ecart_bord_premiere_barre-ecart_barres;
        else    
            x= ~~(x/ecart_barres)*ecart_barres+ecart_bord_premiere_barre;
        return (x)
    }
    return x;
}
