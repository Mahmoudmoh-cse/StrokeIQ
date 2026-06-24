import { redrawVideoSurface } from "./video_surface.js";

const VIDEO_SIZE_CLASSES = ["video-size-small", "video-size-medium", "video-size-large"];
const DEFAULT_VIDEO_SIZE = "small";

function getWorkspaceTabs() {
    return Array.from(document.querySelectorAll("[data-workspace-target]"));
}

function dispatchLayoutRefresh() {
    if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
            redrawVideoSurface();
            window.dispatchEvent(new Event("resize"));
        });
    } else {
        redrawVideoSurface();
        window.dispatchEvent(new Event("resize"));
    }
}

function dispatchWorkspaceLayoutChanged(detail) {
    window.dispatchEvent(new CustomEvent("workspace-layout-changed", { detail }));
}

function showWorkspace(targetId) {
    const target = document.getElementById(targetId) || document.getElementById("annotate_view");
    if (!target) {
        return;
    }

    for (const view of document.querySelectorAll(".workspace-view")) {
        const active = view === target;
        view.hidden = !active;
        view.classList.toggle("workspace-view-active", active);
    }

    for (const tab of getWorkspaceTabs()) {
        const active = tab.dataset.workspaceTarget === target.id;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
    }

    if (target.id === "calibrate_view") {
        window.dispatchEvent(new CustomEvent("calibration-view-opened"));
    }
    if (target.id === "metadata_view") {
        window.dispatchEvent(new CustomEvent("metadata-view-opened"));
    }
    if (target.id === "configuration_view") {
        window.dispatchEvent(new CustomEvent("configuration-view-opened"));
    }
    if (target.id === "synchronize_view") {
        window.dispatchEvent(new CustomEvent("synchronize-view-opened"));
    }

    dispatchWorkspaceLayoutChanged({ activeWorkspace: target.id });
    dispatchLayoutRefresh();
}

function applyVideoSize(size = DEFAULT_VIDEO_SIZE) {
    const normalized = VIDEO_SIZE_CLASSES.includes(`video-size-${size}`) ? size : DEFAULT_VIDEO_SIZE;
    const annotateView = document.getElementById("annotate_view");
    const select = document.getElementById("video_size_select");

    if (select) {
        select.value = normalized;
    }

    if (annotateView) {
        annotateView.classList.remove(...VIDEO_SIZE_CLASSES);
        annotateView.classList.add(`video-size-${normalized}`);
    }

    dispatchWorkspaceLayoutChanged({ activeWorkspace: document.querySelector(".workspace-view-active")?.id, videoSize: normalized });
    dispatchLayoutRefresh();
}

function bindWorkspaceLayout() {
    for (const tab of getWorkspaceTabs()) {
        tab.addEventListener("click", () => showWorkspace(tab.dataset.workspaceTarget));
    }

    const sizeSelect = document.getElementById("video_size_select");
    sizeSelect?.addEventListener("change", () => applyVideoSize(sizeSelect.value));

    applyVideoSize(DEFAULT_VIDEO_SIZE);
    showWorkspace("annotate_view");
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", bindWorkspaceLayout);
} else {
    bindWorkspaceLayout();
}
