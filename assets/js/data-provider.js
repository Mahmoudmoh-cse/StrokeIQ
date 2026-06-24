/**
 * @file data-provider.js
 * @brief Generic data provider contract + fallback composition.
 * Copy this file as-is to other projects; implement site-specific factories separately.
 *
 * Contract — every provider must implement:
 *   getCompets()                      → Promise<[{name, type}]>
 *   getRuns(comp)                     → Promise<[{name, type}]>
 *   getDatas(comp, run)               → Promise<[{name, type}]>
 *   getQuality(comp, run, side)       → Promise<[{name, type}]>
 *   loadRunJson(comp, run)            → Promise<object>
 *   fetchCsv(comp, run, filename)     → Promise<[{...}]>
 *   getVideoUrl(comp, run, filename)  → string  (synchronous)
 */

const ASYNC_METHODS = ["getCompets", "getRuns", "getDatas", "getQuality", "loadRunJson", "fetchCsv"];

/**
 * Wraps two providers: tries primary first, falls back to secondary on error.
 * @param {object} primary
 * @param {object} fallback
 * @param {object} [options]
 * @param {boolean} [options.stickyFallback=true] - once primary fails, always use fallback for the session
 */
export function makeFallbackProvider(primary, fallback, { stickyFallback = true } = {}) {
    let usingFallback = false;

    const provider = {
        getVideoUrl: (...args) => {
            try { return (usingFallback ? fallback : primary).getVideoUrl(...args); }
            catch { return fallback.getVideoUrl(...args); }
        }
    };

    for (const method of ASYNC_METHODS) {
        provider[method] = async (...args) => {
            if (usingFallback) return fallback[method](...args);
            try {
                return await primary[method](...args);
            } catch (err) {
                console.warn(`[DataProvider] ${method} failed on primary (${err.message}), switching to fallback`);
                if (stickyFallback) usingFallback = true;
                return fallback[method](...args);
            }
        };
    }

    return provider;
}

/**
 * Parses CSV text into an array of row objects (auto-typed).
 * Pure function — no network calls.
 * @param {string} text
 * @returns {Array<object>}
 */
export function parseCsvText(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
    if (lines.length === 0) return [];
    const headers = lines[0].split(',');
    return lines.slice(1).map(line => {
        const values = line.split(',');
        const row = {};
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
