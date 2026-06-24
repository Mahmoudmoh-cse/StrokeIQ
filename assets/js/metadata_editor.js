import { megaData, selected_comp, selected_run, getLaneKeysFromRaceMetadata, isOneIsUp } from "./loader.js";
import { nageurs, deactivate_shortcut, activate_shortcut } from "./jquery-custom.js";
import { catalogPaths, fetchCatalog, toSelectOptions } from "./sportsdata.js";
import { getMeta } from "./utils.js";
import { canWriteMetadata, getLocalApiUrl } from "./local_api.js";
import { displayLaneKey } from "./display_labels.js";

const STRUCTURED_RESERVED_KEYS = new Set(["lignes", "videos", "swimmers"]);
const SPORTSDATA_BASE_URL = new URL("../sportsdata/", import.meta.url).href;
const SWIMMER_LIST_URL = new URL("../nageurs_formatted.json", import.meta.url).href;
const MANUAL_VALUE = "__manual__";
const CATALOG_BY_NORMALIZED_KEY = {
    distance: "distances",
    nage: "strokes",
    stroke: "strokes",
    stroketype: "strokes",
    sexe: "sexes",
    sex: "sexes",
    gender: "sexes",
    epreuve: "rounds",
    round: "rounds",
    rounds: "rounds",
    tour: "rounds"
};

let renderInProgress = false;
let sportsdataCatalogs = null;
let sportsdataCatalogPromise = null;
let swimmerCatalog = [];
let swimmerCatalogPromise = null;
let selectedMetadataLaneKey = "";

function getElement(id) {
    return document.getElementById(id);
}

function getMetadata() {
    if (!megaData[0] || typeof megaData[0] !== "object") {
        return null;
    }
    return megaData[0];
}

function setStatus(message, state = "") {
    const status = getElement("metadata_status");
    if (!status) {
        return;
    }
    status.textContent = message;
    status.dataset.state = state;
}

function stringifyValue(value) {
    return JSON.stringify(value, null, 2);
}

function parseValue(value) {
    const trimmed = String(value ?? "").trim();
    if (trimmed === "") {
        return "";
    }
    try {
        return JSON.parse(trimmed);
    } catch {
        return value;
    }
}

function displayValue(value) {
    return typeof value === "string" ? value : stringifyValue(value);
}

function normalizedMetadataKey(key) {
    return String(key ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function catalogNameForKey(key) {
    return CATALOG_BY_NORMALIZED_KEY[normalizedMetadataKey(key)] ?? null;
}

function catalogOptionsForKey(key) {
    const catalogName = catalogNameForKey(key);
    return catalogName ? sportsdataCatalogs?.[catalogName] ?? [] : [];
}

async function loadSportsdataCatalogs() {
    if (sportsdataCatalogs) {
        return sportsdataCatalogs;
    }
    if (!sportsdataCatalogPromise) {
        sportsdataCatalogPromise = Promise.all([
            fetchCatalog(catalogPaths.swimming.distances, SPORTSDATA_BASE_URL),
            fetchCatalog(catalogPaths.swimming.strokes, SPORTSDATA_BASE_URL),
            fetchCatalog(catalogPaths.swimming.rounds, SPORTSDATA_BASE_URL),
            fetchCatalog(catalogPaths.common.sexes, SPORTSDATA_BASE_URL)
        ]).then(([distances, strokes, rounds, sexes]) => {
            sportsdataCatalogs = {
                distances: toSelectOptions(distances),
                strokes: toSelectOptions(strokes),
                rounds: toSelectOptions(rounds),
                sexes: toSelectOptions(sexes)
            };
            return sportsdataCatalogs;
        });
    }
    return sportsdataCatalogPromise;
}

async function loadSwimmerCatalog() {
    if (swimmerCatalog.length > 0) {
        return swimmerCatalog;
    }
    if (typeof window !== "undefined" && window.__TEST__) {
        return swimmerCatalog;
    }
    if (typeof fetch !== "function") {
        return swimmerCatalog;
    }
    if (!swimmerCatalogPromise) {
        swimmerCatalogPromise = fetch(SWIMMER_LIST_URL)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.json();
            })
            .then((data) => {
                const names = Array.isArray(data)
                    ? data.map((item) => typeof item === "string" ? item : item?.nom).filter(Boolean)
                    : [];
                swimmerCatalog = Array.from(new Set(names));
                return swimmerCatalog;
            });
    }
    return swimmerCatalogPromise;
}

function fillSwimmerSearchList(options = swimmerCatalog) {
    const select = getElement("metadata_swimmer_search_select");
    if (!select) {
        return;
    }
    select.replaceChildren();
    for (const name of options) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        select.append(option);
    }
}

function refreshSwimmerSearchList() {
    const input = getElement("metadata_swimmer_search_input");
    const query = String(input?.value ?? "").trim().toLowerCase();
    const options = query
        ? swimmerCatalog.filter((name) => name.toLowerCase().includes(query))
        : swimmerCatalog;
    fillSwimmerSearchList(options);
}

function getCurrentDisplayLaneKeys(metadata = getMetadata()) {
    const keys = getLaneKeysFromRaceMetadata(metadata);
    let meta = null;
    try {
        meta = getMeta();
    } catch {
        meta = metadata?.videos?.[0] ?? metadata;
    }
    return isOneIsUp(meta) ? keys : keys.slice().reverse();
}

function getSwimmerRows() {
    return Array.from(document.querySelectorAll(".metadata-swimmer-row"));
}

function getLaneKeyFromRow(row) {
    return row?.querySelector(".metadata-lane-key")?.value.trim() ?? "";
}

function getLaneKeysFromTable() {
    return getSwimmerRows()
        .map((row) => getLaneKeyFromRow(row))
        .filter(Boolean);
}

function findSwimmerRow(laneKey) {
    return getSwimmerRows().find((row) => getLaneKeyFromRow(row) === laneKey) ?? null;
}

function syncLaneTargetSelect() {
    const select = getElement("metadata_swimmer_lane_select");
    if (!select) {
        return;
    }

    const keys = getLaneKeysFromTable();
    const laneKeys = keys.length > 0 ? keys : [nextLaneKey()];
    if (keys.length === 0) {
        selectedMetadataLaneKey = "";
    } else if (!selectedMetadataLaneKey || !laneKeys.includes(selectedMetadataLaneKey)) {
        selectedMetadataLaneKey = laneKeys[0] ?? "";
    }

    const currentValue = select.value;
    select.replaceChildren();
    for (const laneKey of laneKeys) {
        const option = document.createElement("option");
        option.value = laneKey;
        option.textContent = displayLaneKey(laneKey);
        select.append(option);
    }
    select.value = keys.length === 0
        ? laneKeys[0] ?? ""
        : laneKeys.includes(currentValue) ? currentValue : selectedMetadataLaneKey;
}

function syncLaneRowSelection() {
    for (const row of getSwimmerRows()) {
        row.classList.toggle("is-selected", getLaneKeyFromRow(row) === selectedMetadataLaneKey);
    }
}

function setSelectedMetadataLane(laneKey, { updateSelect = true } = {}) {
    selectedMetadataLaneKey = laneKey ? String(laneKey) : "";
    if (updateSelect) {
        const laneSelect = getElement("metadata_swimmer_lane_select");
        if (laneSelect && selectedMetadataLaneKey) {
            laneSelect.value = selectedMetadataLaneKey;
        }
    }
    syncLaneTargetSelect();
    syncLaneRowSelection();
}

function syncSwimSwitchFromMetadata(metadata = getMetadata()) {
    const swimSwitch = getElement("swim_switch");
    const laneMap = metadata?.lignes;
    if (!swimSwitch || !laneMap || typeof laneMap !== "object") {
        return;
    }

    const laneKeys = getLaneKeysFromRaceMetadata(metadata);
    const displayKeys = getCurrentDisplayLaneKeys(metadata);
    const previousValue = Number(swimSwitch.value);
    swimSwitch.replaceChildren();
    nageurs.length = laneKeys.length;
    displayKeys.forEach((laneKey) => {
        const laneIndex = laneKeys.indexOf(laneKey);
        const swimmerName = String(laneMap[laneKey] ?? "").replace("�", "é");
        nageurs[laneIndex] = swimmerName;
        const option = document.createElement("option");
        option.className = "swimmer-option";
        option.value = String(laneIndex);
        option.textContent = `${laneIndex + 1}- ${swimmerName}`;
        swimSwitch.append(option);
    });

    const selectedValue = Number.isFinite(previousValue) && previousValue >= 0 && previousValue < laneKeys.length
        ? previousValue
        : 0;
    swimSwitch.value = String(selectedValue);
    for (const option of swimSwitch.options) {
        option.classList.toggle("selected", option.value === swimSwitch.value);
    }
}

function setSwimSwitchLane(laneKey, { notify = false } = {}) {
    const swimSwitch = getElement("swim_switch");
    const laneKeys = getLaneKeysFromRaceMetadata(getMetadata());
    const index = laneKeys.indexOf(laneKey);
    if (!swimSwitch || index < 0) {
        return;
    }
    swimSwitch.value = String(index);
    for (const option of swimSwitch.options) {
        option.classList.toggle("selected", option.value === swimSwitch.value);
    }
    if (notify) {
        swimSwitch.dispatchEvent(new Event("input", { bubbles: true }));
    }
}

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

function replaceMetadata(nextMetadata) {
    if (!nextMetadata || typeof nextMetadata !== "object" || Array.isArray(nextMetadata)) {
        throw new Error("The JSON must contain an object.");
    }

    if (!megaData[0] || typeof megaData[0] !== "object") {
        megaData[0] = nextMetadata;
        return;
    }

    for (const key of Object.keys(megaData[0])) {
        delete megaData[0][key];
    }
    Object.assign(megaData[0], nextMetadata);
}

function createInput(value, className, ariaLabel) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = className;
    input.value = value;
    input.setAttribute("aria-label", ariaLabel);
    return input;
}

function createTextarea(value, className, ariaLabel) {
    const textarea = document.createElement("textarea");
    textarea.className = className;
    textarea.value = value;
    textarea.spellcheck = false;
    textarea.setAttribute("aria-label", ariaLabel);
    return textarea;
}

function createCatalogValueControl(key, value) {
    const options = catalogOptionsForKey(key);
    if (options.length === 0) {
        return createTextarea(stringifyValue(value), "metadata-json-value", `Value ${key || "metadata"}`);
    }

    const wrapper = document.createElement("div");
    wrapper.className = "metadata-catalog-control";

    const select = document.createElement("select");
    select.className = "metadata-catalog-select";
    select.setAttribute("aria-label", `Value ${key || "metadata"}`);

    const currentValue = String(value ?? "");
    const hasCatalogValue = options.some((option) => option.value === currentValue);
    for (const optionValue of options) {
        const option = document.createElement("option");
        option.value = optionValue.value;
        option.textContent = optionValue.label;
        select.append(option);
    }

    const manualOption = document.createElement("option");
    manualOption.value = MANUAL_VALUE;
    manualOption.textContent = "Manual value";
    select.append(manualOption);

    const manualInput = createInput(displayValue(value), "metadata-manual-json-value", `Manual value ${key || "metadata"}`);
    manualInput.hidden = hasCatalogValue;
    select.value = hasCatalogValue ? currentValue : MANUAL_VALUE;
    wrapper.classList.toggle("is-manual", !hasCatalogValue);

    wrapper.append(select, manualInput);
    return wrapper;
}

function createRemoveButton(label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "metadata-remove";
    button.textContent = "Remove";
    button.dataset.action = "remove";
    button.setAttribute("aria-label", label);
    return button;
}

function appendRaceFieldRow(key, value) {
    const tbody = getElement("metadata_race_fields");
    if (!tbody) {
        return;
    }

    const row = document.createElement("tr");
    row.className = "metadata-race-row";

    const keyCell = document.createElement("td");
    keyCell.append(createInput(key, "metadata-key", "Metadata field"));

    const valueCell = document.createElement("td");
    valueCell.append(createCatalogValueControl(key, value));

    const actionCell = document.createElement("td");
    actionCell.append(createRemoveButton(`Remove ${key || "field"}`));

    row.append(keyCell, valueCell, actionCell);
    tbody.append(row);
}

function appendSwimmerRow(key, value) {
    const tbody = getElement("metadata_swimmers");
    if (!tbody) {
        return;
    }

    const row = document.createElement("tr");
    row.className = "metadata-swimmer-row";
    row.dataset.laneKey = String(key ?? "");

    const keyCell = document.createElement("td");
    keyCell.append(createInput(key, "metadata-lane-key", "Lane"));

    const valueCell = document.createElement("td");
    valueCell.append(createInput(String(value ?? ""), "metadata-swimmer-name", "Swimmer"));

    const actionCell = document.createElement("td");
    actionCell.append(createRemoveButton(`Remove ${key || "swimmer"}`));

    row.append(keyCell, valueCell, actionCell);
    tbody.append(row);
}

function renderJsonEditor(metadata = getMetadata()) {
    const editor = getElement("metadata_json_editor");
    if (!editor || !metadata) {
        return;
    }
    editor.value = JSON.stringify(metadata, null, 2);
}

async function renderMetadataEditor() {
    const metadata = getMetadata();
    const raceBody = getElement("metadata_race_fields");
    const swimmersBody = getElement("metadata_swimmers");

    if (!raceBody || !swimmersBody) {
        return;
    }

    renderInProgress = true;
    raceBody.replaceChildren();
    swimmersBody.replaceChildren();

    if (!metadata) {
        renderJsonEditor({});
        setStatus("Load a race to edit metadata.", "empty");
        renderInProgress = false;
        return;
    }

    try {
        await loadSportsdataCatalogs();
    } catch (error) {
        setStatus(`Sportsdata catalogs unavailable: ${error.message}`, "error");
    }
    try {
        await loadSwimmerCatalog();
        refreshSwimmerSearchList();
    } catch (error) {
        setStatus(`Swimmer list unavailable: ${error.message}`, "error");
    }

    for (const [key, value] of Object.entries(metadata)) {
        if (!STRUCTURED_RESERVED_KEYS.has(key)) {
            appendRaceFieldRow(key, value);
        }
    }

    const swimmers = metadata.lignes && typeof metadata.lignes === "object" ? metadata.lignes : {};
    if (Array.isArray(swimmers)) {
        swimmers.forEach((value, index) => appendSwimmerRow(`ligne${index + 1}`, value));
    } else {
        for (const [key, value] of Object.entries(swimmers)) {
            appendSwimmerRow(key, value);
        }
    }

    const tableLaneKeys = getLaneKeysFromTable();
    if (!selectedMetadataLaneKey || !tableLaneKeys.includes(selectedMetadataLaneKey)) {
        selectedMetadataLaneKey = tableLaneKeys[0] ?? "";
    }
    syncLaneTargetSelect();
    syncLaneRowSelection();
    syncSwimSwitchFromMetadata(metadata);

    renderJsonEditor(metadata);
    setStatus("Metadata loaded.", "ready");
    renderInProgress = false;
}

function collectRaceFields() {
    const fields = {};
    for (const row of document.querySelectorAll(".metadata-race-row")) {
        const key = row.querySelector(".metadata-key")?.value.trim();
        if (!key || STRUCTURED_RESERVED_KEYS.has(key)) {
            continue;
        }
        const catalogControl = row.querySelector(".metadata-catalog-control");
        if (catalogControl) {
            const select = catalogControl.querySelector(".metadata-catalog-select");
            if (select?.value === MANUAL_VALUE) {
                fields[key] = parseValue(catalogControl.querySelector(".metadata-manual-json-value")?.value ?? "");
            } else {
                fields[key] = select?.value ?? "";
            }
        } else {
            fields[key] = parseValue(row.querySelector(".metadata-json-value")?.value ?? "");
        }
    }
    return fields;
}

function collectSwimmers() {
    const swimmers = {};
    for (const row of document.querySelectorAll(".metadata-swimmer-row")) {
        const key = row.querySelector(".metadata-lane-key")?.value.trim();
        if (!key) {
            continue;
        }
        row.dataset.laneKey = key;
        swimmers[key] = row.querySelector(".metadata-swimmer-name")?.value ?? "";
    }
    return swimmers;
}

function collectStructuredSwimmers(swimmers) {
    return Object.entries(swimmers || {}).map(([lane, swimmerName], index) => ({
        swimmerId: index,
        swimmerName,
        lane
    }));
}

function syncMetadataFromTables({ updateJson = true } = {}) {
    const metadata = getMetadata();
    if (!metadata || renderInProgress) {
        return;
    }

    const preservedVideos = cloneJson(metadata.videos ?? []);
    const nextMetadata = collectRaceFields();
    nextMetadata.lignes = collectSwimmers();
    nextMetadata.swimmers = collectStructuredSwimmers(nextMetadata.lignes);
    if (metadata.videos !== undefined) {
        nextMetadata.videos = preservedVideos;
    }

    replaceMetadata(nextMetadata);
    if (updateJson) {
        renderJsonEditor(nextMetadata);
    }
    syncLaneTargetSelect();
    syncLaneRowSelection();
    syncSwimSwitchFromMetadata(nextMetadata);
    window.dispatchEvent(new CustomEvent("metadata-updated", { detail: { metadata: nextMetadata } }));
}

function applyJsonFromEditor({ rerender = true } = {}) {
    const editor = getElement("metadata_json_editor");
    if (!editor) {
        return null;
    }

    const parsed = JSON.parse(editor.value);
    replaceMetadata(parsed);
    if (rerender) {
        renderMetadataEditor();
    } else {
        syncSwimSwitchFromMetadata(megaData[0]);
    }
    window.dispatchEvent(new CustomEvent("metadata-updated", { detail: { metadata: megaData[0] } }));
    window.dispatchEvent(new CustomEvent("pool-calibration-updated", { detail: { meta: null } }));
    window.dispatchEvent(new CustomEvent("flash-calibration-updated", { detail: { flash: megaData[0]?.flash } }));
    return megaData[0];
}

function nextLaneKey() {
    const keys = Array.from(document.querySelectorAll(".metadata-lane-key"))
        .map((input) => input.value.trim())
        .filter(Boolean);
    const maxNumber = keys.reduce((max, key) => {
        const match = key.match(/^ligne(\d+)$/i);
        return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `ligne${maxNumber + 1}`;
}

function addRaceField() {
    appendRaceFieldRow("", "");
}

function syncCatalogManualInput(select) {
    const control = select.closest(".metadata-catalog-control");
    const input = control?.querySelector(".metadata-manual-json-value");
    if (!input) {
        return;
    }
    input.hidden = select.value !== MANUAL_VALUE;
    control.classList.toggle("is-manual", select.value === MANUAL_VALUE);
}

function addSwimmer() {
    const laneKey = nextLaneKey();
    appendSwimmerRow(laneKey, "");
    setSelectedMetadataLane(laneKey);
    syncMetadataFromTables();
}

async function saveMetadata() {
    try {
        applyJsonFromEditor({ rerender: false });
    } catch (error) {
        setStatus(`Invalid JSON: ${error.message}`, "error");
        return;
    }

    if (!canWriteMetadata()) {
        setStatus("Metadata updated in memory; static mode cannot write JSON.", "ready");
        renderMetadataEditor();
        return;
    }

    try {
        const response = await fetch(getLocalApiUrl("/saveMetadata"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                competition: selected_comp,
                run: selected_run,
                metadata: megaData[0]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `HTTP ${response.status}`);
        }

        const payload = await response.json();
        setStatus(`Metadata saved: ${payload.path}`, "saved");
        renderMetadataEditor();
    } catch (error) {
        setStatus(`Metadata updated in memory, but JSON could not be written: ${error.message}`, "error");
    }
}

function handleTableClick(event) {
    const button = event.target.closest("[data-action='remove']");
    if (!button) {
        return;
    }
    button.closest("tr")?.remove();
    syncMetadataFromTables();
}

function handleSwimmerTableClick(event) {
    const row = event.target.closest(".metadata-swimmer-row");
    if (!row) {
        return;
    }

    const button = event.target.closest("[data-action='remove']");
    const laneKey = getLaneKeyFromRow(row);
    if (button) {
        row.remove();
        if (selectedMetadataLaneKey === laneKey) {
            selectedMetadataLaneKey = "";
        }
        syncMetadataFromTables();
        const nextLane = selectedMetadataLaneKey || getLaneKeysFromTable()[0] || "";
        setSelectedMetadataLane(nextLane);
        return;
    }

    setSelectedMetadataLane(laneKey);
    setSwimSwitchLane(laneKey, { notify: true });
}

function handleApplyJson() {
    try {
        applyJsonFromEditor();
        setStatus("JSON applied in memory.", "ready");
    } catch (error) {
        setStatus(`Invalid JSON: ${error.message}`, "error");
    }
}

function handleRaceFieldsInput(event) {
    if (event.target.closest("[data-action='remove']")) {
        return;
    }
    syncMetadataFromTables();
}

function handleRaceFieldsChange(event) {
    if (event.target.matches(".metadata-catalog-select")) {
        syncCatalogManualInput(event.target);
        syncMetadataFromTables();
        return;
    }
    if (event.target.matches(".metadata-key")) {
        syncMetadataFromTables({ updateJson: false });
        renderMetadataEditor();
        return;
    }
    syncMetadataFromTables();
}

function handleSwimmerInput(event) {
    const row = event.target.closest(".metadata-swimmer-row");
    const laneKey = getLaneKeyFromRow(row);
    if (laneKey) {
        selectedMetadataLaneKey = laneKey;
    }
    syncMetadataFromTables();
    setSelectedMetadataLane(selectedMetadataLaneKey);
}

function handleLaneTargetChange(event) {
    setSelectedMetadataLane(event.target.value);
    setSwimSwitchLane(event.target.value, { notify: true });
}

function handleSwimmerSearchInput() {
    refreshSwimmerSearchList();
}

function handleSwimmerSearchChange(event) {
    const input = getElement("metadata_swimmer_search_input");
    if (input) {
        input.value = event.target.value;
    }
}

function assignSelectedSwimmerToLane() {
    const input = getElement("metadata_swimmer_search_input");
    const searchSelect = getElement("metadata_swimmer_search_select");
    const laneSelect = getElement("metadata_swimmer_lane_select");
    const swimmerName = String(searchSelect?.value || input?.value || "").trim();
    const laneKey = String(laneSelect?.value || selectedMetadataLaneKey || nextLaneKey()).trim();
    if (!swimmerName || !laneKey) {
        return;
    }

    let row = findSwimmerRow(laneKey);
    if (!row) {
        appendSwimmerRow(laneKey, "");
        row = findSwimmerRow(laneKey);
    }
    row?.querySelector(".metadata-swimmer-name")?.setAttribute("value", swimmerName);
    const swimmerInput = row?.querySelector(".metadata-swimmer-name");
    if (swimmerInput) {
        swimmerInput.value = swimmerName;
    }

    setSelectedMetadataLane(laneKey);
    setSwimSwitchLane(laneKey, { notify: true });
    syncMetadataFromTables();
}

function bindMetadataEditor() {
    getElement("metadata_add_field")?.addEventListener("click", addRaceField);
    getElement("metadata_add_swimmer")?.addEventListener("click", addSwimmer);
    getElement("metadata_apply_json")?.addEventListener("click", handleApplyJson);
    getElement("metadata_save")?.addEventListener("click", saveMetadata);
    getElement("metadata_assign_swimmer")?.addEventListener("click", assignSelectedSwimmerToLane);
    getElement("metadata_swimmer_lane_select")?.addEventListener("change", handleLaneTargetChange);
    getElement("metadata_swimmer_search_input")?.addEventListener("input", handleSwimmerSearchInput);
    getElement("metadata_swimmer_search_input")?.addEventListener("focus", deactivate_shortcut);
    getElement("metadata_swimmer_search_input")?.addEventListener("blur", activate_shortcut);
    getElement("metadata_swimmer_search_select")?.addEventListener("change", handleSwimmerSearchChange);

    getElement("metadata_race_fields")?.addEventListener("input", handleRaceFieldsInput);
    getElement("metadata_race_fields")?.addEventListener("change", handleRaceFieldsChange);
    getElement("metadata_swimmers")?.addEventListener("input", handleSwimmerInput);
    getElement("metadata_race_fields")?.addEventListener("click", handleTableClick);
    getElement("metadata_swimmers")?.addEventListener("click", handleSwimmerTableClick);
    window.addEventListener("metadata-view-opened", renderMetadataEditor);
    const saveButton = getElement("metadata_save");
    if (saveButton) {
        saveButton.disabled = !canWriteMetadata();
        saveButton.title = canWriteMetadata()
            ? ""
            : "Static mode: JSON writing is unavailable.";
    }
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", bindMetadataEditor);
} else {
    bindMetadataEditor();
}
