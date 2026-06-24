const DISPLAY_LABELS = new Map([
    ["hommes", "Men"],
    ["femmes", "Women"],
    ["mixte", "Mixed"],
    ["carre", "Square"],
    ["series", "Heats"],
    ["serie", "Heat"],
    ["série", "Heat"],
    ["demifinale", "Semifinal"],
    ["demi_finale", "Semifinal"],
    ["demi-finale", "Semifinal"],
    ["finale", "Final"],
    ["finalea", "Final A"],
    ["finaleb", "Final B"],
    ["freestyle", "Freestyle"],
    ["translation", "Translation"],
    ["dos", "Backstroke"],
    ["backstroke", "Backstroke"],
    ["brasse", "Breaststroke"],
    ["breaststroke", "Breaststroke"],
    ["papillon", "Butterfly"],
    ["butterfly", "Butterfly"],
    ["4nages", "Individual medley"],
    ["medley", "Individual medley"],
    ["fixegauche", "Left fixed camera"],
    ["fixedroite", "Right fixed camera"],
    ["dessus", "Top view"]
]);

export function displayLabel(value) {
    const raw = String(value ?? "").trim();
    const key = raw.toLowerCase();
    return DISPLAY_LABELS.get(key) || raw;
}

export function displayRunPart(value) {
    return displayLabel(value);
}

export function displayLaneKey(value) {
    const raw = String(value ?? "").trim();
    const match = raw.match(/^ligne(\d+)$/i);
    return match ? `Lane ${match[1]}` : displayLabel(raw);
}

export function displayVideoType(value) {
    return displayLabel(value);
}

export function displayFileLabel(value) {
    const raw = String(value ?? "").trim();
    if (!raw) {
        return "";
    }
    const extension = raw.match(/\.[a-z0-9]+$/i)?.[0] || "";
    const stem = extension ? raw.slice(0, -extension.length) : raw;
    const label = stem
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map(displayLabel)
        .join(" ");
    return extension ? `${label}${extension}` : label;
}
