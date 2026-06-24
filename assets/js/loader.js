/**
 * @file loader.js
 * @brief fichier d'initialisation et de chargement des courses et de leurs données, la plupart des variables globales originent de ce fichier.
 */
//It fetches some JSON data from a URL and processes it to make it usable.
//It fetches competition data and populates a dropdown list (<select>) with the retrieved data.
//It fetches run data based on the selected competition and populates another dropdown list with the retrieved run data.
//It gets data for a selected competition and run combination.
//It loads the selected run with the selected data.
//It sets up event listeners and initializes some elements.

import { make_flat_usable,vide_last_added_data, find_end, curate_data } from "./data_handler.js";
import { getUrlVars} from "./utils.js";
import { sec_to_timestr, edit_temp_start, video_volume, temp_start, edit_vue_du_dessus, clampSelectedSwim } from "./refactor-script.js";
import { curate_annotate_data, getAvg } from "./data_handler.js";
import { update_cycle_rapide } from "./cycles_handler.js";
import { construct_time_entry, set_placeholder_of_time_entry } from "./side_views.js";
import { vidStart,vidDrag } from "./videoHandler.js";
import { refreshVideoSurface } from "./video_surface.js";
import {
    buildStaticDataFromManifest,
    createEmptyStaticData,
    normalizeFlatManifest,
    resolveRunAlias,
} from "./demo_manifest.js";
import { demoDataRoot, displaySwimmers, setGrad } from "./main.js"
import { formatValidationIssue, validateCsvUrlHeaders } from "./sportsdata.js";
import { dataProvider, setStaticProviderData } from "./aquanote-providers.js";
import { getSportsdataLoadFormatId } from "./local_api.js";
import { displayRunPart } from "./display_labels.js";
import { cleanupExtraSwimmers, getExpectedTurnDistances, getExpectedTurns, normalizeNumberOfSwimmers, validateSwimmerCountEvents } from "./race_distance.js";

let flat;
let flatManifest = null;
let staticData = createEmptyStaticData();

/**
 * @brief contient le nom de la compétition sélectionnée.
 */
export let selected_comp = '';

let ncycle = 20;
const queryString = getUrlVars(); // Lecture des paramètres URL

/**
 *   @brief Dimensions de la piscine
 */
export let pool_size= [50,20];

export let compets={};
export let selected_run = '';
/**@brief contient les noms des annotations déjà réalisées */
export let datas = [];
export let vidName;
/**
 * @brief contient le nombre d'images par secondes de la vidéo.
 */
export let frame_rate = 50;

/**
 * @brief = [t,r] avec t le dictionnaire de la méta de la course (distance, nageurs, vidéos, ...) et r un csv si data contient automatique, [] sinon Initialisé dans load_run()
 */
export let megaData = [];
/**@brief Dictionnaire associant un id_swimmer avec un array de data, ex : {0:[], 1:[{frameId:252, event:"cycle", ...}, {}, ...], ...}*/
export let curr_swims = {};
/**@brief Liste des checkpoints utilisé, last_checkpoint prendra une valeur parmis celles-là*/
export let meters_checkpoints = [0,25,50,75,100,125,150,175,200];
/**@brief Liste des distances où des virages peuvent survenir pour la course chargée (pas opti).*/ 
export let turn_distances = [0,50,100,150,200,250,300,350,400];
/**@brief Dictionnaire associant id_nageur à un dictionnaire associant distance (0 (reaction), 50, 100, 150 et 200m) à un Temps (float, secondes)*/
export let turn_times = { 0:{} ,1:{},2:{},3:{ 0: 1.02, 50: 10.00, 100: 20.00 },4:{},5:{},6:{},7:{}} 
/**@brief le moment où la vidéo se termine */
export let temp_end = -1;
export let inter = 100;
/**
 * @brief nombre de caméra disponible pour la course.
 */
export let n_camera = 2;



window.curr_swims = curr_swims; // Pour que curr_swims soit accessible au html
window.selected_comp = selected_comp; // Pour que selected_comp soit accessible au html

function syncLoaderGlobals() {
    if (typeof window === "undefined") {
        return;
    }
    window.curr_swims = curr_swims;
    window.selected_comp = selected_comp;
    window.megaData = megaData;
    window.frame_rate = frame_rate;
    window.temp_end = temp_end;
}

syncLoaderGlobals();

function extractLaneNumber(laneKey) {
    const match = String(laneKey).match(/\d+/);
    return match ? parseInt(match[0], 10) : Number.MAX_SAFE_INTEGER;
}

export function getLaneKeysFromRaceMetadata(metadata = megaData[0]) {
    const laneMap = metadata?.lignes || {};
    const numberOfSwimmers = getConfiguredSwimmerCount(metadata);
    return Object.keys(laneMap).sort((left, right) => {
        const leftNumber = extractLaneNumber(left);
        const rightNumber = extractLaneNumber(right);
        if (leftNumber !== rightNumber) {
            return leftNumber - rightNumber;
        }
        return left.localeCompare(right);
    }).slice(0, numberOfSwimmers);
}

export function getConfiguredSwimmerCount(metadata = megaData[0]) {
    if (metadata?.numberOfSwimmers !== undefined) {
        return normalizeNumberOfSwimmers(metadata.numberOfSwimmers);
    }
    const laneCount = Object.keys(metadata?.lignes || {}).length;
    return normalizeNumberOfSwimmers(laneCount || 1);
}

export function getLaneCount(metadata = megaData[0]) {
    const laneKeys = getLaneKeysFromRaceMetadata(metadata);
    if (laneKeys.length > 0) {
        return laneKeys.length;
    }
    return Math.max(1, Math.round(pool_size[1] / 2));
}

export function getLaneSpan(metadata = megaData[0]) {
    return pool_size[1] / getLaneCount(metadata);
}

function defaultSwimmerName(swimmerId) {
    return `Swimmer ${Number(swimmerId) + 1}`;
}

function csvSwimmerNameForId(rows = [], swimmerId) {
    return (rows || [])
        .map((row) => Number(row?.swimmerId ?? row?.swimmer) === swimmerId ? String(row.swimmerName || "").trim() : "")
        .find((name) => name && name !== defaultSwimmerName(swimmerId));
}

export function getSwimmerName(metadata = megaData[0], swimmerId = 0) {
    const id = Number(swimmerId) || 0;
    const lane = `ligne${id + 1}`;
    const structured = Array.isArray(metadata?.swimmers)
        ? metadata.swimmers.find((swimmer) => Number(swimmer.swimmerId) === id || swimmer.lane === lane)
        : null;
    const structuredName = String(structured?.swimmerName || "").trim();
    if (structuredName) return structuredName;
    const laneName = String(metadata?.lignes?.[lane] || "").trim();
    return laneName || defaultSwimmerName(id);
}

export function syncSwimmerMetadata(metadata = megaData[0], rows = []) {
    if (!metadata) return metadata;
    const count = getConfiguredSwimmerCount(metadata);
    const existingLanes = metadata.lignes && typeof metadata.lignes === "object" ? metadata.lignes : {};
    const existingSwimmers = Array.isArray(metadata.swimmers) ? metadata.swimmers : [];
    const nextLanes = {};
    const nextSwimmers = [];
    for (let i = 0; i < count; i++) {
        const lane = `ligne${i + 1}`;
        const structured = existingSwimmers.find((swimmer) => Number(swimmer.swimmerId) === i || swimmer.lane === lane);
        const fromStructured = String(structured?.swimmerName || "").trim();
        const fromLane = String(existingLanes[lane] || "").trim();
        const fromCsv = csvSwimmerNameForId(rows, i);
        const name = fromStructured || (fromLane && fromLane !== defaultSwimmerName(i) ? fromLane : "") || fromCsv || fromLane || defaultSwimmerName(i);
        nextLanes[lane] = name;
        nextSwimmers.push({ swimmerId: i, swimmerName: name, lane });
    }
    metadata.lignes = nextLanes;
    metadata.swimmers = nextSwimmers;
    return metadata;
}

export function isOneIsUp(metaLike = megaData[0]?.videos?.[0] ?? megaData[0]) {
    const value = metaLike?.one_is_up ?? metaLike;
    if (typeof value === "string") {
        return value.toLowerCase() === "true";
    }
    return value === true;
}

export function getLaneYPosition(swimmerIndex, metaLike = megaData[0]?.videos?.[0] ?? megaData[0]) {
    const laneSpan = getLaneSpan(megaData[0] ?? metaLike);
    return (getDisplayLaneIndex(swimmerIndex, metaLike) + 0.5) * laneSpan;
}

export function videoMatchesType(video, typeVideo) {
    const expected = String(typeVideo || "").toLowerCase();
    if (!expected || !video) {
        return false;
    }
    return String(video.type_video || "").toLowerCase() === expected
        || String(video.name || "").toLowerCase().includes(expected);
}

export function findVideoByType(videos = megaData[0]?.videos, typeVideo) {
    return Array.isArray(videos)
        ? videos.find((video) => videoMatchesType(video, typeVideo))
        : undefined;
}

export function getDisplayLaneIndex(swimmerIndex, metaLike = megaData[0]?.videos?.[0] ?? megaData[0]) {
    const laneCount = getLaneCount(megaData[0] ?? metaLike);
    const clampedIndex = Math.max(0, Math.min(swimmerIndex, laneCount - 1));
    return isOneIsUp(metaLike) ? clampedIndex : laneCount - clampedIndex - 1;
}

export function applyRaceSettings(settings = {}) {
  if (!megaData[0]) return;
  const raceDistanceM = Number(settings.raceDistanceM ?? megaData[0].raceDistanceM ?? megaData[0].distance ?? 100);
  const poolLengthM = Number(settings.poolLengthM ?? megaData[0].poolLengthM ?? megaData[0].taille_piscine?.[0] ?? pool_size[0] ?? 25);
  const strokeType = settings.strokeType ?? megaData[0].strokeType ?? megaData[0].nage ?? "freestyle";
  const distanceMode = settings.distanceMode ?? megaData[0].distanceMode ?? (megaData[0].distanceCalibration ? "calibrated" : "interpolated");
  const numberOfSwimmers = normalizeNumberOfSwimmers(settings.numberOfSwimmers ?? megaData[0].numberOfSwimmers ?? getConfiguredSwimmerCount(megaData[0]));

  megaData[0].raceDistanceM = raceDistanceM;
  megaData[0].distance = String(raceDistanceM);
  megaData[0].poolLengthM = poolLengthM;
  megaData[0].strokeType = strokeType;
  megaData[0].distanceMode = distanceMode;
  megaData[0].numberOfSwimmers = numberOfSwimmers;
  const existingLanes = megaData[0].lignes || {};
  const existingSwimmers = Array.isArray(megaData[0].swimmers) ? megaData[0].swimmers : [];
  const trimmedLanes = {};
  const trimmedSwimmers = [];
  for (let i = 0; i < numberOfSwimmers; i++) {
    const key = `ligne${i + 1}`;
    const structured = existingSwimmers.find((swimmer) => Number(swimmer.swimmerId) === i || swimmer.lane === key);
    const name = String(structured?.swimmerName || existingLanes[key] || `Swimmer ${i + 1}`).trim();
    trimmedLanes[key] = name;
    trimmedSwimmers.push({ swimmerId: i, swimmerName: name, lane: key });
  }
  megaData[0].lignes = trimmedLanes;
  megaData[0].swimmers = trimmedSwimmers;
  megaData[0].expectedTurns = getExpectedTurns(raceDistanceM, poolLengthM);
  megaData[0].expectedTurnDistances = getExpectedTurnDistances(raceDistanceM, poolLengthM);
  megaData[0].taille_piscine = [poolLengthM, Number(megaData[0].taille_piscine?.[1] ?? pool_size[1] ?? 20)];

  pool_size = megaData[0].taille_piscine;
  meters_checkpoints = [];
  for (let i = 0; i <= raceDistanceM; i += Math.min(25, poolLengthM)) {
    meters_checkpoints.push(i);
  }
  turn_distances = [0, ...megaData[0].expectedTurnDistances, raceDistanceM];
  syncLoaderGlobals();
}

export function resolveRunName(runName) {
    return resolveRunAlias(runName, staticData.aliases);
}

export function getRunDisplayParts(runName, competitionName = selected_comp) {
    const normalizedRunName = resolveRunName(runName);
    if (!normalizedRunName) {
        return ["", "", "", ""];
    }
    const runEntry = (compets[competitionName] || []).find((run) => run?.name === normalizedRunName);
    const metadataParts = [
        runEntry?.nage,
        runEntry?.sexe,
        runEntry?.distance,
        runEntry?.epreuve,
    ].map((value) => String(value ?? "").trim());
    if (metadataParts.some(Boolean)) {
        return metadataParts;
    }

    const prefix = competitionName ? `${competitionName}_` : "";
    let runWithoutCompetition = prefix && normalizedRunName.startsWith(prefix)
        ? normalizedRunName.slice(prefix.length)
        : normalizedRunName;

    const rawParts = runWithoutCompetition.split("_").filter(Boolean);
    if (prefix && rawParts[0] && /^\d{4}$/.test(rawParts[0])) {
        runWithoutCompetition = rawParts.slice(1).join("_");
    }

    const parts = runWithoutCompetition.split("_").filter(Boolean);
    return [
        parts[0] || "",
        parts[1] || "",
        parts[2] || "",
        parts.slice(3).join("_") || "",
    ];
}

function getRunEntry(runName, competitionName = selected_comp) {
    const normalizedRunName = resolveRunName(runName);
    return (compets[competitionName] || []).find((run) => run?.name === normalizedRunName) || null;
}

function getRunParts(runEntryOrName, competitionName = selected_comp) {
    if (runEntryOrName && typeof runEntryOrName === "object") {
        const metadataParts = [
            runEntryOrName.nage,
            runEntryOrName.sexe,
            runEntryOrName.distance,
            runEntryOrName.epreuve,
        ].map((value) => String(value ?? "").trim());
        if (metadataParts.some(Boolean)) {
            return metadataParts;
        }
        return getRunDisplayParts(runEntryOrName.name, competitionName);
    }
    const entry = getRunEntry(runEntryOrName, competitionName);
    if (entry) {
        return getRunParts(entry, competitionName);
    }
    return getRunDisplayParts(runEntryOrName, competitionName);
}

function formatRunDisplayName(runEntryOrName, competitionName = selected_comp) {
    const parts = getRunParts(runEntryOrName, competitionName).filter(Boolean);
    return parts.length > 0 ? parts.map(displayRunPart).join(" - ") : String(runEntryOrName?.name || runEntryOrName || "");
}

async function enrichRunsWithMetadata(comp, runs) {
    return Promise.all((runs || []).map(async (run) => {
        try {
            const metadata = await dataProvider.loadRunJson(comp, run.name);
            return {
                ...run,
                ...(metadata?.nage ? { nage: metadata.nage } : {}),
                ...(metadata?.sexe ? { sexe: metadata.sexe } : {}),
                ...(metadata?.distance ? { distance: metadata.distance } : {}),
                ...(metadata?.epreuve ? { epreuve: metadata.epreuve } : {}),
            };
        } catch {
            return run;
        }
    }));
}

function addRunPartsToSets(runEntryOrName, competitionName, type_nage, sexe_nageurs, distance, étape_compétition) {
    const [part1, part2, part3, part4] = getRunParts(runEntryOrName, competitionName);
    if (part1) type_nage.add(part1);
    if (part2) sexe_nageurs.add(part2);
    if (part3) distance.add(part3);
    if (part4) étape_compétition.add(part4);
}

function getDemoAssetUrl(relativePath) {
    return new URL(relativePath, demoDataRoot).href;
}

async function populateStaticDataFromManifest(loadVideos = false) {
    staticData = await buildStaticDataFromManifest(
        flatManifest,
        loadVideos
            ? async (competitionName, runName) => {
                  try {
                      const metadataPath = getDemoAssetUrl(`${competitionName}/${runName}/${runName}.json`);
                      return await d3.json(metadataPath);
                  } catch (error) {
                      console.error(`Could not load metadata for ${runName}:`, error);
                      return { videos: [] };
                  }
              }
            : null
    );
    setStaticProviderData(staticData);
}

async function loadStaticDataFromFlat() {
    const rawFlat = await d3.json(getDemoAssetUrl("flat.json"));
    flatManifest = normalizeFlatManifest(rawFlat, make_flat_usable(rawFlat));
    flat = flatManifest.entries;
    await populateStaticDataFromManifest(true);
}







/**
 * @brief init permet d'initialiser la page en chargeant les données nécessaires.
 * Elle récupère les données JSON, les vidéos des courses ainsi que les annotations déjà réalisées sur cette course.
 */
export async function init() {
  try {
    // Gérer différemment selon l'environnement
    if (isGitHubMode()) {
      await loadStaticDataFromFlat();
    } else {
      const rawFlat = await d3.json(getDemoAssetUrl("flat.json"));
      flatManifest = normalizeFlatManifest(rawFlat, make_flat_usable(rawFlat));
      flat = flatManifest.entries;
      await populateStaticDataFromManifest(true);
    }
      
      await getCompets();
      await getRuns(selected_comp);
      
      if (compets[selected_comp]) {
        processRunData(compets[selected_comp]);
      } else {
        console.error("compets[selected_comp] n'existe pas! selected_comp =", selected_comp);
      }
      
      let selected_run1 = resolveRunName(queryString["course"]);
      if (!selected_run1) {
        selected_run1 = selected_run || compets[selected_comp]?.[0]?.name || "";
      }
      
      // Only proceed with loading run if we have a valid run selected
      if (selected_run1) {
        syncRunSelectorsFromRunName(selected_run1, selected_comp);
        await getDatas(selected_comp, selected_run1);
        if (queryString["data"] && datas.includes(queryString["data"])) {
            $("#temp").val(queryString["data"]);
        }
        await load_run(selected_run1, $("#temp").val());
      }

  } catch (error) {
      console.error("Error in init:", error);
      console.error("Stack trace:", error.stack);
  }
}

/**
 * @brief Traite les données des courses pour remplir les listes déroulantes de sélection avec les options de catégories de nage, sexe des nageurs, distance et étape de compétition.
 * @param {Array} runs - Tableau contenant les noms des courses.
 * @returns {void}
 */

function processRunData(runs) {
  // Initialiser les listes pour chaque position
  const type_nage = new Set();
  const sexe_nageurs = new Set();
  const distance = new Set();
  const étape_compétition = new Set();

  // Parcourir les noms des courses
  runs.forEach(run => {
      addRunPartsToSets(run, selected_comp, type_nage, sexe_nageurs, distance, étape_compétition);
  });
  const sortedDistance = Array.from(distance).sort((a, b) => parseInt(a) - parseInt(b));

  fillDropdown("run_part1", Array.from(type_nage));
  fillDropdown("run_part2", Array.from(sexe_nageurs));
  fillDropdown("run_part3", Array.from(sortedDistance));
  fillDropdown("run_part4", Array.from(étape_compétition));
}

function syncRunSelectorsFromRunName(runName, competitionName = selected_comp) {
    if (!runName || !competitionName) {
        return;
    }

    const normalizedRunName = resolveRunName(runName);
    const [part1, part2, part3, part4] = getRunParts(normalizedRunName, competitionName);

    if (part1) {
        $("#run_part1").val(part1);
    }
    if (part2) {
        $("#run_part2").val(part2);
    }
    if (part3) {
        $("#run_part3").val(part3);
    }
    if (part4) {
        $("#run_part4").val(part4);
    }
}


/**
 * @brief charge les annotations de la course sélectionnée.
 * @param {*} comp 
 * @param {*} run 
 * @returns 
 */
export async function getDatas(comp, run) {
    run = resolveRunName(run);
    datas = [];

    const c = await collectRunCsvEntries(comp, run);

    let select = $("#temp");
    const previousSelection = select.val();
    select.empty();

    let csvFiles = await filterSportsdataCsvFiles(comp, run, c);
    for (let i = 0; i < csvFiles.length; i++) {
        select.append("<option value='" + csvFiles[i].name + "'>" + csvFiles[i].name + "</option>");
        datas.push(csvFiles[i].name);
    }
    select.append("<option value='new_data'>new_data</option>");
    if (previousSelection && datas.includes(previousSelection)) {
        select.val(previousSelection);
    } else if (datas.length === 1) {
        select.val(datas[0]);
    } else if (datas.length > 1) {
        select.val(datas[0]);
    }
}

async function dataExistsForRun(comp, run, data) {
    if (!data || data === "new_data") {
        return true;
    }
    if (datas.includes(data)) {
        return true;
    }
    const entries = await collectRunCsvEntries(comp, run);
    const validEntries = await filterSportsdataCsvFiles(comp, run, entries);
    return validEntries.some(entry => entry.name === data);
}

/**
 * @brief permet de récupérer les compétitions disponibles sur le serveur.
 */
export async function getCompets() {
    const queryString = getUrlVars();
    const competitionParam = queryString["competition"];

    $("#competition").empty();

    const data = await dataProvider.getCompets();
    const c = data.filter(d => d.type == "directory");

    let select = $("#competition");
    for (let i = 0; i < c.length; i++) {
        if (c[i].name === competitionParam) {
            selected_comp = c[i].name;
        }
        select.append("<option value='" + c[i].name + "'>" + c[i].name + "</option>");
    }
    if (selected_comp === "" && c.length > 0) {
        selected_comp = c[0].name;
    }
    $("#competition").val(selected_comp);
    c.map(d => compets[d.name] = []);
    syncLoaderGlobals();
}

/**
 * @brief Définit le dictionnaire des compétitions disponibles
 * Met à jour la variable globale compets avec les compétitions fournies
 * 
 * @param {array} c Tableau des compétitions à définir
 */
export function setcompets(c){
  c.map(d => compets[d.name] = []);
}
/**
 * @brief permet de récupérer les options de qualité disponibles pour une compétition et une course spécifiques.
 * @param {*} comp 
 * @param {*} run 
 * @param {*} actual_side 
 * @returns {void}
 */
export async function get_quality(comp, run, actual_side) {
    const c = await dataProvider.getQuality(comp, run, actual_side);

    let select = $("#quality");
    select.empty();
    select.append('<option value="">change quality</option>');

    for (let i = 0; i < c.length; i++) {
        let optionName = c[i].name.split("_");
        optionName = optionName[optionName.length - 1].split(".")[0];
        let regTest = new RegExp("\\d+(p|P|k|K)");
        if (!(regTest.test(optionName))) {
            optionName = "Original";
        }
        select.append("<option click='getValue(" + c[i].name + ");' value='" + c[i].name + "'>" + optionName + "</option>");
    }
}

/**
 * @brief retourne les courses disponibles pour une compétition spécifique et remplit les listes déroulantes avec les options de nage, sexe des nageurs, distance et étape de compétition.
 * @param {*} comp 
 * @returns 
 */
export async function getRuns(comp) {
  const queryString = getUrlVars();
  const requestedRun = resolveRunName(queryString["course"]);
  
  // Initialiser compets[comp] s'il n'existe pas
  if (!compets[comp]) {
    compets[comp] = [];
  }
  
  if (!compets[comp] || compets[comp].length === 0) {
    const runs = await enrichRunsWithMetadata(comp, await dataProvider.getRuns(comp));
    compets[comp] = runs;
    selected_run = runs[0]?.name || "";

    let select = $("#run");
    select.empty();

    const type_nage = new Set();
    const sexe_nageurs = new Set();
    const distance = new Set();
    const étape_compétition = new Set();
    for (let i = 0; i < runs.length; i++) {
        if (runs[i].name === requestedRun) {
            selected_run = runs[i].name;
        }
        let tclass = "data_missing";
        if (flat && flat[runs[i].name] && "espadon" in flat[runs[i].name]) {
            if (flat[runs[i].name]["espadon"] || flat[runs[i].name]["espadonModifie"]) {
                tclass = "data_unchecked";
            }
        }
        if (flat && flat[runs[i].name] && "data_checked" in flat[runs[i].name]) {
            if (flat[runs[i].name]["data_checked"]) {
                tclass = "data_checked";
            }
        }
        let nomAffiche = formatRunDisplayName(runs[i], comp);
        select.append("<option value='" + runs[i].name + "' class='" + tclass + "'>" + nomAffiche + "</option>");
        addRunPartsToSets(runs[i], comp, type_nage, sexe_nageurs, distance, étape_compétition);
    }
    const sortedDistance = Array.from(distance).sort((a, b) => parseInt(a) - parseInt(b));
    fillDropdown("run_part1", Array.from(type_nage));
    fillDropdown("run_part2", Array.from(sexe_nageurs));
    fillDropdown("run_part3", Array.from(sortedDistance));
    fillDropdown("run_part4", Array.from(étape_compétition));
    $("#run").val(selected_run);
    syncRunSelectorsFromRunName(selected_run, comp);
    await getDatas(comp, selected_run);
    return runs;
  } else {
      const type_nage = new Set();
      const sexe_nageurs = new Set();
      const distance = new Set();
      const étape_compétition = new Set();
      let select = $("#run");
      select.empty();
      if (!selected_run || !compets[comp].some(run => run.name === selected_run)) {
          selected_run = compets[comp][0]?.name || "";
      }
      for (let i = 0; i < compets[comp].length; i++) {
          if (compets[comp][i].name === requestedRun) {
              selected_run = compets[comp][i].name;
          }
          select.append("<option value='" + compets[comp][i].name + "'>" + formatRunDisplayName(compets[comp][i], comp) + "</option>");
          addRunPartsToSets(compets[comp][i], comp, type_nage, sexe_nageurs, distance, étape_compétition);
          }
        const sortedDistance = Array.from(distance).sort((a, b) => parseInt(a) - parseInt(b));
        fillDropdown("run_part1", Array.from(type_nage));
        fillDropdown("run_part2", Array.from(sexe_nageurs));
        fillDropdown("run_part3", Array.from(sortedDistance));
        fillDropdown("run_part4", Array.from(étape_compétition));
        $("#run").val(selected_run);
        syncRunSelectorsFromRunName(selected_run || compets[comp][0]?.name, comp);
        await getDatas(comp, selected_run);
  }
  return compets[comp];
}

/**
 * @brief fonction qui remplit un élément <select> avec des options.
 * @param {string} dropdownId 
 * @param {object} options tableau d'options à ajouter au dropdown. 
 */
function fillDropdown(dropdownId, options) {
  const dropdown = document.getElementById(dropdownId);
  dropdown.innerHTML = ""; // Vider les options existantes

  // Ajouter les nouvelles options
  options.forEach(optionText => {
      const option = document.createElement("option");
      option.value = optionText;
      option.textContent = displayRunPart(optionText);
      dropdown.appendChild(option);
  });

  if (options.length > 0) {
      dropdown.value = options[0];
  }

}
/**
 * @brief permet de récupérer le temps de départ d'une course à partir des métadonnées.
 * @param {*} meta 
 * @returns 
 */
export function get_temp_start(meta) {
  let temp_start_temp;
    if (meta.raceStartVideoTime) {
        temp_start_temp = meta.raceStartVideoTime
    } else if (meta.start_flash) {
        temp_start_temp = meta.start_flash
    } else if (meta.start_synchro_flash) {
        temp_start_temp = meta.start_synchro_flash
    } else {
        temp_start_temp = meta.start_moment
    }
    if (isNaN(temp_start_temp)) {
        temp_start_temp = 0;
    }
    if(temp_start_temp === undefined){
        temp_start_temp = 0;
    }

    return temp_start_temp
}

/**
 * @brief permet de charger une course spécifique avec ses données associées.
 * @param {*} run 
 * @param {*} data 
 * @param {*} starTime 
 */
export async function load_run(run, data, starTime = null) {
  run = resolveRunName(run);
  edit_vue_du_dessus(false); // Réinitialise la vue du dessus
  const errors = []; // Liste des erreurs rencontrées

  try {
    selected_comp = $("#competition").val();

    if (data && data !== "new_data") {
      const existsForRun = await dataExistsForRun(selected_comp, run, data);
      if (!existsForRun) {
        console.warn(`Ignoring stale data selection "${data}" for run "${run}".`);
        data = "";
      }
    }

    let t;

    try {
      t = await dataProvider.loadRunJson(selected_comp, run);
    } catch (e) {
      console.error("Error while loading the JSON file:", e);
      errors.push("JSON file not found or invalid: " + run + '.json');
      throw e;
    }

    let meta = null;
    vidName = "";
    $("#vidsw").show();
    n_camera = 2; // Valeur par défaut, peut être modifiée par le JSON
    if (t.ncamera){
      n_camera = t.ncamera;
    } else if (Array.isArray(t.videos)) {
      n_camera = t.videos.length;
    }
    if (n_camera === 1) {
      $("#vidsw").hide();
    }
    try {
      if (t.videos && t.videos.length > 0) {
        if (n_camera > 1) {
          meta = findVideoByType(t.videos, "fixeDroite");

          if ((meta?.start_side || t.start_side) === "left") {
            meta = findVideoByType(t.videos, "fixeGauche");
          }
          meta = meta || t.videos[0];
        }
        else if (n_camera === 1) {
          meta = t.videos[0];
        }

        if (!meta) {
          errors.push("Video 'fixeDroite' or 'fixeGauche' not found.");
        } else {
          vidName = meta.name;
          if (t.raceStartVideoTime !== undefined) {
            meta.raceStartVideoTime = t.raceStartVideoTime;
          }
        }
      } else {
        errors.push("No video referenced in the JSON.");
      }
    } catch  {
      errors.push("Error while reading video metadata.");
    }
    if (t.taille_piscine){
      pool_size=t.taille_piscine;
    }
    else{
      pool_size=[50,20];// utile pour la rétrocompatibilité vis a vis des courses déjà annotées qui n'ont pas de taile_piscine dans le json
    }
    syncSwimmerMetadata(t);
    const laneCount = getLaneCount(t);
    Object.keys(curr_swims).forEach((key) => delete curr_swims[key]);
    frame_rate = (meta && !isNaN(parseInt(meta.fps))) ? parseInt(meta.fps) : 50;
    let validatedAnnotationRows = null;
    
    if (data !== "new_data" && data && data.trim() !== "") {
      let r = [];
      try {
        
        const csvUrl = dataProvider.getVideoUrl(selected_comp, run, data);

        if (await shouldValidateSwimmingTrackingCsv(selected_comp, run, data)) {
	          validatedAnnotationRows = normalizeSportsdataRows(
	            await validateAndParseSportsdataCsv(csvUrl, data),
	            t
	          );
          r = validatedAnnotationRows;
        } else {
          r = await dataProvider.fetchCsv(selected_comp, run, data);
        }

        if (!Array.isArray(r)) r = [];
        syncSwimmerMetadata(t, r);
        const swimmerWarnings = validateSwimmerCountEvents(r, laneCount);
        if (swimmerWarnings.length > 0) {
          alert(swimmerWarnings.join("\n") + "\nExtra swimmers will be ignored for this race.");
          r = cleanupExtraSwimmers(r, laneCount);
        }
        if (r.length > 0 && r[0]['startTimeEdit'] != null && starTime == null) {
          edit_temp_start(r[0]['startTimeEdit']);
        } else {
          edit_temp_start(starTime == null ? get_temp_start(meta) : parseFloat((starTime.toString()).split(':')[1]));
        }
      } catch (e) {
        if (await shouldValidateSwimmingTrackingCsv(selected_comp, run, data)) {
          alert(e.message);
          throw e;
        }
        errors.push("CSV file '" + data + "' not found or invalid. " + e);
        edit_temp_start(get_temp_start(meta));
      }
    } else {
      edit_temp_start(get_temp_start(meta));
    }
      $('#editStartTime').attr('value', sec_to_timestr(temp_start));
      selected_run = run;
  
      if (t.temps) {
        let tmax = -Infinity;
        let keys = Object.keys(t.temps);
        for (let i = 0; i < keys.length; i++) {
          if (t.temps[keys[i]] === "None") continue;
  
          let tem = ("" + t.temps[keys[i]]).split(":");
          let ttem = (parseInt(tem[0]) * 60) + parseFloat(tem[1]);
  
          if (ttem > tmax) tmax = ttem;
        }
        temp_end = tmax;
      }
      if (data && data.includes("automatique")) {

        let r = await dataProvider.fetchCsv(selected_comp, run, data);
        megaData = [t, r];
        let maxFrame = Math.max(...megaData[1].map(d => d.frame_number));
  
        let temp = getAvg(megaData[0]);
  
        if (temp) {
          temp_end = temp;
        } else {
          find_end(megaData[1], parseInt(megaData[0]["distance"]));
        }
        
        inter = parseInt(maxFrame / ncycle);
  
        for (let i = 0; i < laneCount; i++) {
          curr_swims[i] = curate_data(megaData[1].filter(d => d.swimmer == i), t);
        }
      } else if (data === "new_data" || !data || !datas.includes(data)) {
        megaData = [t, []];
        for (let i = 0; i < laneCount; i++) {
          curr_swims[i] = [];
        }
      } else {
        megaData = [t, []];
        let time_dif;

        let r = validatedAnnotationRows ?? await dataProvider.fetchCsv(selected_comp, run, data);

        if (r[0]['startTimeEdit'] != null) {
          time_dif = temp_start - r[0]['startTimeEdit'];
        } else {
          time_dif = temp_start - get_temp_start(meta);
        }
        let frameId_dif = frame_rate * time_dif;
  
        for (let i = 0; i < r.length; i++) {
          if (temp_start) r[i].frameId = parseFloat((r[i].frameId + frameId_dif));
        }
  
        r = cleanupExtraSwimmers(curate_annotate_data(r), laneCount);
  
        for (let i = 0; i < laneCount; i++) {
          curr_swims[i] = r.filter(d => d.swimmerId == i);
        }
      }
      if (!isNaN(megaData[0].distance)) {
        meters_checkpoints = [];
        turn_distances = [];
        for (let i = 0; i <= megaData[0].distance; i += 25) {
          meters_checkpoints.push(i);
        }
        for (let i = 0; i <= megaData[0].distance; i += pool_size[0]) {
          turn_distances.push(i);
        }
      } else {
        const regex_dist = "_[0-9]+[x]*[0-9]+[._]";
        let resultats = run.match(regex_dist);
        if (resultats != null) {
          resultats = resultats[0].slice(1, -1);
          resultats = resultats.split("x");
          if (resultats.length > 1) {
            resultats = parseInt(resultats[0]) * parseInt(resultats[1]);
          } else {
            resultats = resultats[0];
          }
  
          meters_checkpoints = [];
          turn_distances = [];
          for (let i = 0; i <= resultats; i += 25) {
            meters_checkpoints.push(i);
          }
          for (let i = 0; i <= resultats; i += pool_size[0]) {
            turn_distances.push(i);
          }
        }
      }
      applyRaceSettings({
        raceDistanceM: t.raceDistanceM ?? t.distance ?? 100,
        poolLengthM: t.poolLengthM ?? t.taille_piscine?.[0] ?? 25,
        strokeType: t.strokeType ?? t.nage ?? "freestyle",
        distanceMode: t.distanceMode ?? (t.distanceCalibration ? "calibrated" : "interpolated"),
      });
      for (let i = 0; i < laneCount; i++) {
        turn_times[i] = {};
        let all_turn_data = curr_swims[i].filter(annotation => (annotation.mode == "turn" || annotation.mode == "finish" || annotation.mode == "reaction"));
        for (let turn_data of all_turn_data) {
          if (turn_distances.includes(turn_data.cumul)) {
            turn_times[i][turn_data.cumul] = (turn_data.frameId) / frame_rate;
          } else if ([0].includes(turn_data.cumul)) {
            turn_times[i][turn_data.cumul] = (turn_data.frameId) / frame_rate;
          }
          
        }
      }
      syncLoaderGlobals();
      $("#swim_switch").html("");
      clampSelectedSwim(laneCount);
      displaySwimmers(t["lignes"]);
      $("#vid").attr("crossorigin", "anonymous");
      
      if (meta?.name) {
        $("#vid").attr("src", dataProvider.getVideoUrl(selected_comp, run, meta.name));
      }
      vide_last_added_data();
      update_cycle_rapide();
      construct_time_entry();
      set_placeholder_of_time_entry();
      d3.selectAll("#video").call(d3.drag().on("start", vidStart).on("drag", vidDrag));
      refreshVideoSurface(meta);
      document.getElementById("vid").currentTime = temp_start;
      document.getElementById('vid').volume = video_volume;
      setGrad(temp_start);
    
  } catch (e) {
    console.error("Main loading error:", e);
    if (errors.length > 0) {
      alert("Errors detected while loading:\n\n" + errors.join("\n"));
    }
  }
  
  let is_dessus=megaData[0].videos.filter(d => videoMatchesType(d, "dessus"));
  if (is_dessus.length > 0) {
    $(".vid_dessus").show();
  } else {
    $(".vid_dessus").hide();
  }
}

// des setters pour les variables globales

/**
 * @brief Modifie le temps de fin de la course
 * Setter pour la variable globale temp_end
 * 
 * @param {number} x Nouveau temps de fin
 */
export function edit_temp_end(x) {
    temp_end=x;
}

/**
 * @brief Modifie le nom de la vidéo chargée
 * Setter pour la variable globale vidName
 * 
 * @param {string} x Nouveau nom de vidéo
 */
export function edit_vidName(x) {
    vidName=x;
}

/**
 * @brief Vérifie si on est en mode GitHub Pages (sans API locale).
 * @returns {boolean} true si on est sur GitHub, false sinon
 */
function isGitHubMode() {
    return (
        window.location.hostname.includes('github.io') ||
        window.location.hostname.includes('githubusercontent.com') ||
        window.location.pathname.includes('/annotation/')
    );
}

function parseCsvText(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
    if (lines.length === 0) return [];
    const headers = lines[0].split(',');
    return lines.slice(1).map(line => {
        const values = line.split(',');
        let row = {};
        headers.forEach((header, i) => {
            let v = values[i] !== undefined ? values[i] : "";
            if (v === "") {
                row[header] = v;
            } else if (!isNaN(Number(v)) && v.trim() !== "") {
                row[header] = Number(v);
            } else if (v.toLowerCase() === "true") {
                row[header] = true;
            } else if (v.toLowerCase() === "false") {
                row[header] = false;
            } else {
                row[header] = v;
            }
        });
        return row;
    });
}

function csvEntry(name) {
    return { name, type: "file" };
}

function addUniqueCsvEntry(entries, seen, name) {
    const csvName = String(name || "").trim();
    if (!csvName || !csvName.toLowerCase().endsWith(".csv") || seen.has(csvName)) {
        return;
    }
    seen.add(csvName);
    entries.push(csvEntry(csvName));
}

async function collectRunCsvEntries(comp, run) {
    const entries = [];
    const seen = new Set();

    try {
        const providerEntries = await dataProvider.getDatas(comp, run);
        for (const entry of providerEntries || []) {
            addUniqueCsvEntry(entries, seen, entry?.name);
        }
    } catch (error) {
        console.warn(`Could not list CSV files for ${comp}/${run}:`, error);
    }

    try {
        const metadata = await dataProvider.loadRunJson(comp, run);
        for (const csvName of metadata?.csvFiles || []) {
            addUniqueCsvEntry(entries, seen, csvName);
        }
        for (const csvName of metadata?.annotations || []) {
            addUniqueCsvEntry(entries, seen, csvName);
        }
        addUniqueCsvEntry(entries, seen, metadata?.sourceSportsdata?.csv);
    } catch (error) {
        console.warn(`Could not inspect run metadata for CSV files in ${comp}/${run}:`, error);
    }

    return entries;
}

async function filterSportsdataCsvFiles(comp, run, entries) {
    const csvFiles = (entries || []).filter((entry) => entry?.name && entry.name.toLowerCase().endsWith(".csv"));
    console.info(`[Aquanote CSV] Found ${csvFiles.length} CSV file(s) for ${comp}/${run}`, csvFiles.map((entry) => entry.name));
    return csvFiles;
}

async function isAquanoteAnnotationCsv(csvUrl) {
    try {
        const response = await fetch(csvUrl);
        if (!response.ok) {
            return false;
        }
        const text = await response.text();
        const firstLine = String(text || "").split(/\r?\n/)[0] || "";
        const headers = firstLine
            .replace(/^\uFEFF/, "")
            .split(",")
            .map((header) => header.trim());
        const requiredHeaders = ["frameId", "swimmerId", "event"];
        return requiredHeaders.every((header) => headers.includes(header))
            && (headers.includes("cumul") || headers.includes("distance (m)"));
    } catch (error) {
        console.warn("[Aquanote CSV] Could not inspect CSV header:", error);
        return false;
    }
}

async function shouldValidateSwimmingTrackingCsv(comp, run, data) {
    if (!data || data === "new_data" || String(data).includes("automatique")) {
        return false;
    }
    const csvUrl = dataProvider.getVideoUrl(comp, run, data);
    return !(await isAquanoteAnnotationCsv(csvUrl));
}

async function validateAndParseSportsdataCsv(csvUrl, data) {
    const formatId = getSportsdataLoadFormatId();
    const result = await validateCsvUrlHeaders(csvUrl, {
        formatId
    });
    const issueMessages = result.issues
        .filter((issue) => (issue.severity || "error") === "error")
        .map(formatValidationIssue);
    if (issueMessages.length > 0) {
        const message = `Sportsdata CSV header validation failed for ${data}:\n${issueMessages.join("\n")}`;
        console.error(message);
        throw new Error(message);
    }

    console.log(`Sportsdata CSV header validation ok for ${data}`, {
        format: formatId,
        headers: result.headers
    });
    return parseCsvText(result.text);
}

function formatSportsdataNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function normalizeBasicTrackingRows(rows, metadata) {
    const poolLength = Number(metadata?.taille_piscine?.[0]) || 50;
    const poolWidth = Number(metadata?.taille_piscine?.[1]) || 20;
    const laneKeys = getLaneKeysFromRaceMetadata(metadata);
    const laneCount = getConfiguredSwimmerCount(metadata);
    const sourceLane = metadata?.sourceSportsdata?.lane;
    const defaultLaneIndex = Math.max(0, laneKeys.indexOf(sourceLane));
    const swimmers = metadata?.lignes || {};
    const startSide = String(metadata?.start_side || metadata?.videos?.[0]?.start_side || "left");
    const swimmerIds = [...new Set(rows
        .map((row) => Number(row.swimmerId))
        .filter(Number.isFinite))]
        .sort((left, right) => left - right);
    const swimmerIdToLaneIndex = new Map(swimmerIds.map((swimmerId, index) => [swimmerId, index]));

    return cleanupExtraSwimmers(rows, laneCount).map((row) => {
        const rawSwimmerId = Number(row.swimmerId);
        const swimmerId = swimmerIdToLaneIndex.has(rawSwimmerId)
            ? swimmerIdToLaneIndex.get(rawSwimmerId)
            : defaultLaneIndex;
        const laneIndex = Math.max(0, Math.min(laneCount - 1, swimmerId));
        const lane = laneKeys[laneIndex] || `ligne${laneIndex + 1}`;
        const distance = formatSportsdataNumber(row.distance);
        const time = formatSportsdataNumber(row.time);
        const eventX = startSide === "left"
            ? Math.max(0, Math.min(poolLength, poolLength - distance))
            : Math.max(0, Math.min(poolLength, distance));
        const eventY = (laneIndex + 0.5) * (poolWidth / laneCount);

        return {
            frameId: Number(row.frameId),
            swimmerId,
            swimmerName: swimmers[lane] || `Swimmer ${swimmerId + 1}`,
            lane,
            cumul: distance,
            eventId: row.eventId,
            eventX,
            eventY,
            event: row.eventId,
            "TempsVideo (s)": time,
            "Temps (s)": time,
            "distance (m)": distance,
            "tempo (s)": "",
            "frequence (cylce/min)": "",
            "amplitude (m)": "",
            "vitesse (m/s)": ""
        };
    });
}

function normalizeSportsdataRows(rows, metadata) {
    if (getSportsdataLoadFormatId() === "formats.csv.swimming-basic-tracking") {
        return normalizeBasicTrackingRows(rows, metadata);
    }
    return rows;
}
