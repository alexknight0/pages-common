// Update light for Alex's GitHub Pages sites: green dot = this device runs the latest
// deploy, orange "Update" pill = it doesn't, hollow grey = couldn't check (offline?).
//
// Pages lets browsers cache every file for 10 minutes, so right after a deploy a device can
// run an old copy, or a mix of old and new files (e.g. a new index.html with an old app.js).
// version.js (written by the pre-commit hook in this repo) holds VERSION, the commit time,
// and FILES, the SHA-256 of every app file. A check fetches the live version.js past the
// cache and flags an update when
//   - the live VERSION is newer than the one running, or
//   - any app file in this browser's cache differs from the live copy (a mix).
// Tapping Update re-downloads every app file past the cache, then reloads.
//
// Usage (load a pinned version so the file never changes under a site):
//   import { initUpdateLight } from "https://cdn.jsdelivr.net/gh/alexknight0/pages-common@1.0.0/update.js";
//   initUpdateLight({ version: VERSION, buttons: "#version", report: setStatus, beforeUpdate: save });
//
// Markup: <button class="version" data-state="checking"><i></i><span></span></button>
// Sites style it with [data-state=checking|ok|stale|unknown|updating].

const CHECK_MS = 5 * 60_000;

function formatVersion(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

async function sha256(buf) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Reads VERSION and FILES out of version.js text (module or classic script).
export function parseVersionFile(text) {
  const version = text.match(/VERSION = "([^"]+)"/)?.[1] ?? null;
  let files = null;
  const m = text.match(/FILES = (\{[^;]*\});/);
  if (m) {
    try { files = JSON.parse(m[1]); } catch { files = null; }
  }
  return { version, files };
}

// Paths whose cached copy doesn't match the live hash. "./" is the page itself (same bytes
// as index.html). force-cache returns what this browser has cached, which is what the page
// loaded; a file that isn't cached comes from the network and so matches.
export async function staleFiles(files) {
  const paths = Object.keys(files);
  if ("index.html" in files) paths.push("./");
  const out = [];
  await Promise.all(paths.map(async (p) => {
    try {
      const res = await fetch(p, { cache: "force-cache" });
      if (!res.ok) return;
      if ((await sha256(await res.arrayBuffer())) !== files[p === "./" ? "index.html" : p]) out.push(p);
    } catch { /* offline: can't tell */ }
  }));
  return out.sort();
}

/**
 * options:
 *   version       VERSION from the site's version.js (the copy that's running). Required.
 *   buttons       selector, element, or list of elements for the light. Default ".version".
 *   report(text)  shows the result of a tap (status line, toast…). Optional.
 *   beforeUpdate  async () => false to cancel; save unsaved work here. Optional.
 *   serviceWorker true to also call registration.update() when updating.
 *   files         extra paths to refresh on Update (besides FILES, "./" and version.js).
 * Returns { check } so a site can trigger a check itself.
 */
export function initUpdateLight(opts) {
  const running = opts.version;
  const btns = typeof opts.buttons === "string" || !opts.buttons
    ? [...document.querySelectorAll(opts.buttons || ".version")]
    : opts.buttons instanceof Element ? [opts.buttons] : [...opts.buttons];
  const report = opts.report || (() => {});
  let state = "checking";
  let latest = null; // { version, files }
  let stale = [];

  function labels() {
    const run = formatVersion(running);
    return {
      checking: "Checking for updates…",
      ok: `Up to date (version ${run})`,
      stale: latest?.version > running
        ? `Update available: running ${run}, latest is ${formatVersion(latest.version)}. Tap to update.`
        : `Update available: some files on this device are out of date (${stale.join(", ")}). Tap to update.`,
      unknown: `Couldn't check for updates (offline?). Running ${run}.`,
      updating: "Updating…",
    };
  }

  function setState(s) {
    state = s;
    const label = labels()[s];
    for (const b of btns) {
      b.dataset.state = s;
      b.title = label;
      b.setAttribute("aria-label", label);
      const span = b.querySelector("span");
      if (span) span.textContent = s === "stale" ? "Update" : "";
    }
  }

  async function check() {
    if (state === "updating") return;
    try {
      const res = await fetch(`version.js?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      latest = parseVersionFile(await res.text());
      if (!latest.version) throw new Error("no version");
      // ISO timestamps compare as strings; only a newer live copy counts as an update.
      stale = latest.version > running ? [] : latest.files ? await staleFiles(latest.files) : [];
      if (state !== "updating") setState(latest.version > running || stale.length ? "stale" : "ok");
    } catch {
      if (state !== "updating") setState("unknown");
    }
  }

  async function update() {
    if (opts.beforeUpdate && (await opts.beforeUpdate()) === false) return;
    setState("updating");
    const paths = new Set(["./", "version.js", ...Object.keys(latest?.files || {}), ...(opts.files || [])]);
    const reg = opts.serviceWorker && "serviceWorker" in navigator
      ? await navigator.serviceWorker.getRegistration().catch(() => null)
      : null;
    // A plain reload could still use stale copies from the HTTP cache, so refresh them first.
    await Promise.all([
      reg ? reg.update().catch(() => {}) : null,
      ...[...paths].map((f) => fetch(f, { cache: "reload" }).catch(() => {})),
    ]);
    location.reload();
  }

  for (const b of btns) {
    // Don't take focus (that would close a phone keyboard).
    b.addEventListener("pointerdown", (e) => e.preventDefault());
    b.addEventListener("click", async () => {
      if (state === "checking" || state === "updating") return;
      if (state === "stale") return update();
      // Green or grey: check again now and say what came of it.
      setState("checking");
      report(labels().checking);
      await check();
      report(labels()[state]);
    });
  }

  setState("checking");
  check();
  setInterval(check, CHECK_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
  window.addEventListener("online", check);
  return { check };
}
