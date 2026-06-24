/**
 * @file demo_manifest.js
 * @brief Helpers to normalize demo manifests and derive static loader data.
 */

export function createEmptyStaticData() {
    return {
        competitions: [],
        runs: {},
        csvFiles: {},
        videos: {},
        aliases: {},
    };
}

export function normalizeDirectoryEntry(entry) {
    if (typeof entry === "string") {
        return { name: entry, type: "directory" };
    }
    return {
        ...entry,
        type: entry?.type ?? "directory",
    };
}

export function normalizeFileEntry(entry) {
    if (typeof entry === "string") {
        return { name: entry, type: "file" };
    }
    return {
        ...entry,
        type: entry?.type ?? "file",
    };
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeLegacyFlatManifest(rawFlat) {
    const competitions = [];
    const runs = {};
    const entries = {};

    for (const [competitionName, competitionRuns] of Object.entries(rawFlat)) {
        if (!isPlainObject(competitionRuns)) {
            continue;
        }

        competitions.push({ name: competitionName, type: "directory" });
        runs[competitionName] = [];

        for (const [runName, runEntry] of Object.entries(competitionRuns)) {
            const normalizedEntry = isPlainObject(runEntry) ? { ...runEntry } : {};
            const aliases = Array.isArray(normalizedEntry.aliases) ? normalizedEntry.aliases : [];
            const csvFiles = Array.isArray(normalizedEntry.csvFiles) ? normalizedEntry.csvFiles : [];

            runs[competitionName].push({
                name: runName,
                type: "directory",
                ...(aliases.length > 0 ? { aliases } : {}),
                ...(csvFiles.length > 0 ? { csvFiles } : {}),
            });
            entries[runName] = normalizedEntry;
        }
    }

    return {
        competitions,
        runs,
        entries,
    };
}

export function normalizeFlatManifest(rawFlat, arrayEntries = {}) {
    if (Array.isArray(rawFlat)) {
        return {
            competitions: [],
            runs: {},
            entries: arrayEntries,
        };
    }

    if (!rawFlat || typeof rawFlat !== "object") {
        return {
            competitions: [],
            runs: {},
            entries: {},
        };
    }

    if ("entries" in rawFlat || "competitions" in rawFlat || "runs" in rawFlat) {
        return {
            competitions: Array.isArray(rawFlat.competitions) ? rawFlat.competitions : [],
            runs: rawFlat.runs && typeof rawFlat.runs === "object" ? rawFlat.runs : {},
            entries: rawFlat.entries && typeof rawFlat.entries === "object" ? rawFlat.entries : {},
        };
    }

    return normalizeLegacyFlatManifest(rawFlat);
}

export function resolveRunAlias(runName, aliases = {}) {
    if (!runName) {
        return runName;
    }
    return aliases[runName] || runName;
}

export async function buildStaticDataFromManifest(flatManifest, loadMetadata = null) {
    const dynamicData = createEmptyStaticData();
    dynamicData.competitions = flatManifest.competitions.map((competition) => ({
        ...competition,
        type: competition.type ?? "directory",
    }));

    const runsByCompetition = flatManifest.runs || {};
    for (const [competitionName, runEntries] of Object.entries(runsByCompetition)) {
        dynamicData.runs[competitionName] = [];

        for (const rawRunEntry of runEntries || []) {
            const runEntry = normalizeDirectoryEntry(rawRunEntry);
            const runName = runEntry.name;
            const manifestEntry = flatManifest.entries[runName] || {};
            const metadata = loadMetadata ? await loadMetadata(competitionName, runName) : null;
            const enrichedRunEntry = {
                ...runEntry,
                ...(metadata?.nage ? { nage: metadata.nage } : {}),
                ...(metadata?.sexe ? { sexe: metadata.sexe } : {}),
                ...(metadata?.distance ? { distance: metadata.distance } : {}),
                ...(metadata?.epreuve ? { epreuve: metadata.epreuve } : {}),
            };
            dynamicData.runs[competitionName].push(enrichedRunEntry);
            const aliases = [
                ...(Array.isArray(runEntry.aliases) ? runEntry.aliases : []),
                ...(Array.isArray(manifestEntry.aliases) ? manifestEntry.aliases : []),
                ...(Array.isArray(metadata?.aliases) ? metadata.aliases : []),
            ];

            dynamicData.aliases[runName] = runName;
            aliases.forEach((alias) => {
                if (alias) {
                    dynamicData.aliases[alias] = runName;
                }
            });

            const csvEntries =
                runEntry.csvFiles ??
                manifestEntry.csvFiles ??
                metadata?.csvFiles ??
                metadata?.annotations ??
                [];
            dynamicData.csvFiles[runName] = csvEntries.map(normalizeFileEntry);

            dynamicData.videos[runName] = (metadata?.videos || []).map((video) =>
                normalizeFileEntry(video?.name ?? video)
            );
        }
    }

    return dynamicData;
}
