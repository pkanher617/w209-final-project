/* App entry: hash routing between the three views + upload wiring.
   Views are hash routes inside one page so uploaded data survives navigation
   (the browser keeps it in memory; nothing is sent to a server). */

import { onStoreChange, loadExportifyFiles, loadStreamingFiles } from "./data.js";
import { renderSongs } from "./views/songs.js";
import { renderGenre } from "./views/genre.js";
import { renderTrends } from "./views/trends.js";

const ROUTES = {
  songs: renderSongs,
  genre: renderGenre,
  trends: renderTrends,
};

function currentRoute() {
  const m = location.hash.match(/^#\/(songs|genre|trends)\b/);
  return m ? m[1] : null;
}

function navigate() {
  const route = currentRoute();
  if (!route) {
    location.replace("#/songs"); // hashchange re-enters navigate()
    return;
  }
  for (const name of Object.keys(ROUTES)) {
    document.getElementById(`view-${name}`).hidden = name !== route;
  }
  document.querySelectorAll("nav a[data-route]").forEach((a) => {
    a.classList.toggle("active", a.dataset.route === route);
  });
  ROUTES[route]();
}

// ── upload wiring ────────────────────────────────────────────────────────────

const LOADERS = {
  exportify: loadExportifyFiles,
  streaming: loadStreamingFiles,
};

function wireDropzone(zone) {
  const input = zone.querySelector("input[type=file]");
  const errorEl = zone.closest(".gate").querySelector(".gate-error");
  const loader = LOADERS[zone.dataset.kind];

  async function handle(files) {
    if (!files || !files.length) return;
    errorEl.hidden = true;
    zone.classList.add("busy");
    const strong = zone.querySelector("strong");
    const original = strong.textContent;
    strong.textContent = "Parsing…";
    try {
      await loader([...files]);
    } catch (err) {
      errorEl.textContent = err.message || String(err);
      errorEl.hidden = false;
    } finally {
      zone.classList.remove("busy");
      strong.textContent = original;
      input.value = "";
    }
  }

  zone.addEventListener("click", () => input.click());
  zone.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter" || evt.key === " ") {
      evt.preventDefault();
      input.click();
    }
  });
  input.addEventListener("click", (evt) => evt.stopPropagation());
  input.addEventListener("change", () => handle(input.files));
  zone.addEventListener("dragover", (evt) => {
    evt.preventDefault();
    zone.classList.add("dragover");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", (evt) => {
    evt.preventDefault();
    zone.classList.remove("dragover");
    handle(evt.dataTransfer.files);
  });
}

// ── boot ─────────────────────────────────────────────────────────────────────

document.querySelectorAll(".dropzone").forEach(wireDropzone);
window.addEventListener("hashchange", navigate);
onStoreChange(navigate);

let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(navigate, 200);
});

navigate();
