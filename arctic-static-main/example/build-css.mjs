import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const out = join(dirname(fileURLToPath(import.meta.url)), "rise.css");

function slice(file, start, end) {
	const s = readFileSync(join(root, file), "utf8");
	const a = s.indexOf(start);
	const b = end ? s.indexOf(end, a) : -1;
	return a >= 0 ? s.slice(a, b >= 0 ? b : undefined) : "";
}

const css = [
	"/* rise-static v3 */",
	slice("public/css/app.css", "/* ── Palettes", "/* ── Shared tokens"),
	slice("public/css/app.css", "/* ── Shared tokens", "/* ── Bottom taskbar"),
	slice("public/css/app.css", "/* ── Bottom taskbar", "/* ── Address bar"),
	slice("public/css/app.css", "/* ── Address bar", "/* ── Omnibox suggestions"),
	slice("public/css/browser.css", "/* ── Browse shell", "/* ── Vertical side tabs"),
	slice("public/css/media.css", "/* ── Shared media shell", "/* ── Music page").split(
		"/* ── Player",
	)[0],
	`.settings {${slice("public/css/settings.css", ".settings {", "/* ── Sliders").replace(/^\.settings \{/, "")}`,
	`
html, body { margin: 0; height: 100%; overflow: hidden; font-family: "Segoe UI", system-ui, sans-serif; }
#rise-root { position: fixed; inset: 0; display: flex; flex-direction: column; min-height: 0; background: var(--bg); color: var(--text); }
.view { display: none; flex: 1; min-height: 0; overflow: hidden; }
.view.on { display: flex; flex-direction: column; }
.browse__main { flex: 1; display: flex; flex-direction: column; min-height: 0; padding-bottom: calc(var(--taskbar-h) + 18px); }
.frame-shell { position: relative; flex: 1; min-height: 0; }
#browse-frame, #movies-frame { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #000; opacity: 0; pointer-events: none; transition: opacity 0.2s ease; }
#browse-frame.loaded, #movies-frame.loaded { opacity: 1; pointer-events: auto; }
.rise-stage { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; background: radial-gradient(120% 90% at 50% 8%, var(--bg-2), var(--bg)); z-index: 2; }
.rise-stage[hidden] { display: none; }
.rise-spinner { width: 32px; height: 32px; border-radius: 50%; border: 2px solid var(--line); border-top-color: var(--accent); animation: spin 0.85s linear infinite; }
.rise-step { font-size: 13px; color: var(--text-mute); }
.rise-error { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 24px; text-align: center; background: var(--bg); z-index: 3; }
.rise-error[hidden] { display: none; }
.newtab { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; padding: 24px; text-align: center; z-index: 1; }
.newtab[hidden] { display: none; }
.newtab__logo { width: min(160px, 36vw); color: var(--accent); }
.newtab__tagline { margin: 0; color: var(--text-dim); }
.newtab__field { display: flex; gap: 8px; width: min(560px, 92vw); }
.newtab__input { flex: 1; height: 44px; padding: 0 14px; border: 1px solid var(--line); border-radius: 999px; background: rgb(255 255 255 / 0.04); color: var(--text); font: inherit; }
.newtab__go { height: 44px; padding: 0 18px; border: 1px solid rgb(var(--accent-rgb) / 0.35); border-radius: 999px; background: var(--accent-low); color: var(--accent-hi); font: inherit; cursor: pointer; }
.media-player { position: absolute; inset: 0; display: flex; flex-direction: column; background: #000; z-index: 20; }
.media-player[hidden] { display: none; }
.media-player #movies-frame { position: relative; flex: 1; min-height: 0; }
#movies-browse.media-content { flex: 1; overflow-y: auto; overflow-x: hidden; }
.player-rail { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 10px 14px; background: var(--shell); border-bottom: 1px solid var(--line); z-index: 2; }
.rail-btn { height: 36px; padding: 0 12px; border: 1px solid var(--line); border-radius: 999px; background: rgb(255 255 255 / 0.04); color: var(--text); font: inherit; cursor: pointer; }
.player-meta { flex: 1; min-width: 120px; }
.player-title { margin: 0; font-size: 14px; font-weight: 700; }
.player-sub { margin: 2px 0 0; font-size: 12px; color: var(--text-mute); }
.player-server { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-dim); }
.player-server select { height: 34px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: rgb(255 255 255 / 0.04); color: var(--text); font: inherit; }
.player-ep { display: inline-flex; align-items: center; gap: 8px; }
.player-ep input { width: 52px; height: 34px; padding: 0 8px; border: 1px solid var(--line); border-radius: 8px; background: rgb(255 255 255 / 0.04); color: var(--text); font: inherit; }
.chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { height: 34px; padding: 0 12px; border: 1px solid var(--line); border-radius: 999px; background: rgb(255 255 255 / 0.04); color: var(--text-dim); font: inherit; cursor: pointer; }
.chip.on { border-color: rgb(var(--accent-rgb) / 0.35); background: var(--accent-low); color: var(--accent-hi); }
.btn--primary { background: linear-gradient(140deg, var(--accent-hi), var(--accent)); color: var(--accent-ink); border-color: transparent; }
@keyframes spin { to { transform: rotate(360deg); } }
html[data-taskbar="bar"] body { padding-bottom: var(--taskbar-h); }
`,
].join("\n");

writeFileSync(out, css);
console.log(`Wrote ${out} (${(css.length / 1024).toFixed(1)} KB)`);
