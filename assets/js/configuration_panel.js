import {
    DEFAULTS,
    buildDataSourceUrl,
    getApiBaseUrl,
    getDataSourceMode,
    getLocalServerUrl,
    getSportsdataLoadFormatId,
    getSportsdataSaveFormatId
} from "./local_api.js";
import { SPORTS_DATA_CSV_FORMATS } from "./sportsdata.js";

function getElement(id) {
    return document.getElementById(id);
}

function setStatus(message, state = "") {
    const status = getElement("data_source_config_status");
    if (!status) {
        return;
    }
    status.textContent = message;
    status.dataset.state = state;
}

function syncFormatSelect(select, value) {
    if (!select) {
        return;
    }

    select.replaceChildren(...SPORTS_DATA_CSV_FORMATS.map((format) => {
        const option = document.createElement("option");
        option.value = format.id;
        option.textContent = format.title;
        return option;
    }));
    select.value = value;
}

function syncConfigurationForm() {
    const sourceSelect = getElement("config_source_select");
    const localServerInput = getElement("config_local_server_url");
    const apiInput = getElement("config_api_url");
    const sportsdataLoadFormatSelect = getElement("config_sportsdata_load_format");
    const sportsdataSaveFormatSelect = getElement("config_sportsdata_save_format");

    if (sourceSelect) {
        sourceSelect.value = getDataSourceMode();
    }
    if (localServerInput) {
        localServerInput.value = getLocalServerUrl();
    }
    if (apiInput) {
        apiInput.value = getApiBaseUrl();
    }
    syncFormatSelect(sportsdataLoadFormatSelect, getSportsdataLoadFormatId());
    syncFormatSelect(sportsdataSaveFormatSelect, getSportsdataSaveFormatId());
}

function applyConfiguration() {
    const source = getElement("config_source_select")?.value || DEFAULTS.source;
    const localServerUrl = getElement("config_local_server_url")?.value || DEFAULTS.localServerUrl;
    const apiBaseUrl = getElement("config_api_url")?.value || DEFAULTS.apiBaseUrl;
    const sportsdataLoadFormat = getElement("config_sportsdata_load_format")?.value || DEFAULTS.sportsdataLoadFormat;
    const sportsdataSaveFormat = getElement("config_sportsdata_save_format")?.value || DEFAULTS.sportsdataSaveFormat;

    setStatus("Applying configuration...", "ready");
    window.location.assign(buildDataSourceUrl({
        source,
        localServerUrl,
        apiBaseUrl,
        sportsdataLoadFormat,
        sportsdataSaveFormat
    }));
}

function resetConfiguration() {
    setStatus("Resetting configuration...", "ready");
    window.location.assign(buildDataSourceUrl({
        source: DEFAULTS.source,
        localServerUrl: DEFAULTS.localServerUrl,
        apiBaseUrl: DEFAULTS.apiBaseUrl,
        sportsdataLoadFormat: DEFAULTS.sportsdataLoadFormat,
        sportsdataSaveFormat: DEFAULTS.sportsdataSaveFormat
    }));
}

function bindConfigurationPanel() {
    syncConfigurationForm();
    getElement("config_apply")?.addEventListener("click", applyConfiguration);
    getElement("config_reset")?.addEventListener("click", resetConfiguration);
    window.addEventListener("configuration-view-opened", syncConfigurationForm);
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", bindConfigurationPanel);
} else {
    bindConfigurationPanel();
}
