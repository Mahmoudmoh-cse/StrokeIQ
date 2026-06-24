/**
 * @file aquanote-providers.js
 * @brief Site-specific data provider factories for Aquanote.
 *
 * To switch data source, add ?source=local|api|static|auto to the URL.
 * Default (no param): auto — tries the local server first, falls back to static.
 * Configure localServerUrl or apiUrl in the URL or the Configuration tab.
 */

import { makeFallbackProvider, parseCsvText } from "./data-provider.js";
import { getApiBaseUrl, getDataSourceMode, getLocalServerUrl } from "./local_api.js";

// ── Configuration ──────────────────────────────────────────────────────────────
const STATIC_BASE = "videos/";

let staticProviderData = {
    competitions: [],
    runs: {},
    csvFiles: {},
    videos: {},
    aliases: {},
};

export function setStaticProviderData(data) {
    staticProviderData = {
        competitions: Array.isArray(data?.competitions) ? data.competitions : [],
        runs: data?.runs && typeof data.runs === "object" ? data.runs : {},
        csvFiles: data?.csvFiles && typeof data.csvFiles === "object" ? data.csvFiles : {},
        videos: data?.videos && typeof data.videos === "object" ? data.videos : {},
        aliases: data?.aliases && typeof data.aliases === "object" ? data.aliases : {},
    };
}

// ── Provider factories ─────────────────────────────────────────────────────────

function makeStaticProvider(basePath) {
    return {
        getCompets: async () => staticProviderData.competitions,
        getRuns: async (comp) => staticProviderData.runs[comp] ?? [],
        getDatas: async (comp, run) => staticProviderData.csvFiles[run] ?? [],
        getQuality: async () => [],
        loadRunJson: async (comp, run) => {
            const url = `${basePath}${comp}/${run}/${run}.json`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
            return res.json();
        },
        fetchCsv: async (comp, run, filename) => {
            const url = `${basePath}${comp}/${run}/${filename}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
            return parseCsvText(await res.text());
        },
        getVideoUrl: (comp, run, filename) => `${basePath}${comp}/${run}/${filename}`,
    };
}

function makeHttpProvider(baseUrl) {
    async function apiFetch(path) {
        const res = await fetch(`${baseUrl}${path}`);
        if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
        return res.json();
    }
    return {
        getCompets: async () => {
            const data = await apiFetch("/getCompets");
            return Array.isArray(data) ? data : [];
        },
        getRuns: async (comp) => {
            const data = await apiFetch(`/getRuns/${comp}`);
            return Array.isArray(data) ? data.filter(d => d.type === "directory") : [];
        },
        getDatas: async (comp, run) => {
            const data = await apiFetch(`/getDatas/${comp}/${run}`);
            return Array.isArray(data) ? data.filter(d => d.type === "file" && d.name.includes(".csv")) : [];
        },
        getQuality: async (comp, run, side) => {
            const data = await apiFetch(`/getQuality/${comp}/${run}`);
            if (!Array.isArray(data)) return [];
            const key = side === "droite" ? "fixeDroite" : "fixeGauche";
            return data.filter(d => d.type === "file" && d.name.includes(key));
        },
        loadRunJson: async (comp, run) => {
            const res = await fetch(`${baseUrl}/files/${comp}/${run}/${run}.json`);
            if (!res.ok) throw new Error(`API JSON ${res.status}: ${comp}/${run}`);
            return res.json();
        },
        fetchCsv: async (comp, run, filename) => {
            const res = await fetch(`${baseUrl}/files/${comp}/${run}/${filename}`);
            if (!res.ok) throw new Error(`API CSV ${res.status}: ${filename}`);
            return parseCsvText(await res.text());
        },
        getVideoUrl: (comp, run, filename) => `${baseUrl}/files/${comp}/${run}/${filename}`,
    };
}

function makeElectronProvider() {
    const BASE = "courses_demo";
    return {
        getCompets: async () => window.myAPI.getLocalCompetitions(BASE),
        getRuns: async (comp) => window.myAPI.getLocalRuns(BASE, comp),
        getDatas: async (comp, run) => {
            const files = await window.myAPI.getLocalFiles(BASE, comp, run);
            return files.filter(f => f.name && f.name.includes(".csv"));
        },
        getQuality: async (comp, run, side) => {
            const files = await window.myAPI.getLocalFiles(BASE, comp, run);
            const key = side === "droite" ? "fixeDroite" : "fixeGauche";
            return files.filter(f => f.name && f.name.includes(key));
        },
        loadRunJson: async (comp, run) => window.myAPI.readJsonFile(BASE, comp, run, `${run}.json`),
        fetchCsv: async (comp, run, filename) => window.myAPI.readCsvFile(BASE, comp, run, filename),
        getVideoUrl: (comp, run, filename) => `${BASE}/${comp}/${run}/${filename}`,
    };
}

// ── Mode detection & provider selection ───────────────────────────────────────

export function buildProvider() {
    if (window.myAPI !== undefined) {
        return makeElectronProvider();
    }

    const source = getDataSourceMode();

    if (source === "static") return makeStaticProvider(STATIC_BASE);
    if (source === "local")  return makeHttpProvider(getLocalServerUrl());
    if (source === "api")    return makeHttpProvider(getApiBaseUrl());

    // Default: try the local server first, fall back to static files.
    return makeFallbackProvider(
        makeHttpProvider(getLocalServerUrl()),
        makeStaticProvider(STATIC_BASE),
        { stickyFallback: true }
    );
}

export const dataProvider = buildProvider();
