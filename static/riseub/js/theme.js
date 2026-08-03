const KEY = "riseub-prefs";

export const THEMES = [
	{
		id: "mint",
		label: "Mint",
		desc: "Cool mint on charcoal",
		swatches: ["#7ff0c4", "#1d2a26", "#101312"],
	},
	{
		id: "midnight",
		label: "Midnight",
		desc: "Deep blue, calm and focused",
		swatches: ["#5b9dff", "#17223a", "#0d1220"],
	},
	{
		id: "dusk",
		label: "Dusk",
		desc: "Warm purple twilight tones",
		swatches: ["#a78bfa", "#241f38", "#12101c"],
	},
	{
		id: "ember",
		label: "Ember",
		desc: "Fiery oranges and warm amber",
		swatches: ["#ff7a3d", "#33201a", "#140d0a"],
	},
	{
		id: "rose",
		label: "Rose",
		desc: "Soft pink, elegant and modern",
		swatches: ["#fb7185", "#331d24", "#150c10"],
	},
	{
		id: "nord",
		label: "Nord",
		desc: "Arctic, muted and minimal",
		swatches: ["#8fc7d8", "#232c33", "#10151a"],
	},
	{
		id: "sand",
		label: "Sand",
		desc: "Warm neutrals, earthy and calm",
		swatches: ["#e0c097", "#312a22", "#15120e"],
	},
	{
		id: "sakura",
		label: "Sakura",
		desc: "Cherry blossom pinks and creams",
		swatches: ["#f7a8c4", "#33222a", "#160f13"],
	},
	{
		id: "mono",
		label: "Mono",
		desc: "No glow, your colour",
		swatches: ["#e6e8ea", "#26292b", "#111314"],
		custom: true,
	},
];

export const TASKBARS = [
	{ id: "pill", label: "Floating pill", blurb: "Centred, rounded, hovering over the page" },
	{ id: "bar", label: "Filled bar", blurb: "Full width along the bottom, no gaps" },
	{ id: "left", label: "Sidebar · left", blurb: "Vertical rail down the left edge" },
	{ id: "right", label: "Sidebar · right", blurb: "Vertical rail down the right edge" },
	{ id: "halo", label: "Halo", blurb: "Floating pill lit from underneath" },
];

const DEFAULTS = {
	theme: "mint",
	monoAccent: "#9aa3ab",
	popoutStyle: "bar",
	uiScale: 100,
	cornerRadius: 100,
	glowStrength: 100,
	blur: true,
	hideBadges: false,
	taskbar: "pill",
	verticalTabs: false,
	reduceMotion: false,
	dotGrid: true,
	searchEngine: "duckduckgo",
};

let prefs = load();
const listeners = new Set();

function load() {
	try {
		const raw = localStorage.getItem(KEY);
		if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
	} catch {}
	return { ...DEFAULTS };
}

function persist() {
	try {
		localStorage.setItem(KEY, JSON.stringify(prefs));
	} catch {}
}

export function getPrefs() {
	return { ...prefs };
}

export function setPref(key, value) {
	if (prefs[key] === value) return;
	prefs[key] = value;
	persist();
	applyPrefs();
	listeners.forEach((fn) => fn(getPrefs(), key));
}

export function onPrefsChange(fn) {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

let swapTimer = null;

function hexToRgb(hex) {
	const clean = String(hex || "").replace("#", "");
	const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
	const n = parseInt(full, 16);
	if (Number.isNaN(n)) return "154 163 171";
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(" ");
}

/** Mono lets you pick the accent, so it is written straight onto :root. */
/** Sliders write straight onto the root as multipliers. */
function applyScales(root) {
	root.style.setProperty("--ui-scale", (prefs.uiScale || 100) / 100);
	root.style.setProperty("--radius-scale", (prefs.cornerRadius ?? 100) / 100);
	root.style.setProperty("--glow-scale", (prefs.glowStrength ?? 100) / 100);
	root.classList.toggle("no-blur", prefs.blur === false);
	root.classList.toggle("hide-badges", !!prefs.hideBadges);
}

function applyMonoAccent(root) {
	if (prefs.theme !== "mono") {
		["--accent", "--accent-hi", "--accent-deep", "--accent-rgb", "--accent-ink"].forEach(
			(v) => root.style.removeProperty(v)
		);
		return;
	}
	const hex = prefs.monoAccent || "#9aa3ab";
	root.style.setProperty("--accent", hex);
	root.style.setProperty("--accent-hi", `color-mix(in srgb, ${hex} 70%, #fff)`);
	root.style.setProperty("--accent-deep", `color-mix(in srgb, ${hex} 55%, #000)`);
	root.style.setProperty("--accent-rgb", hexToRgb(hex));
	root.style.setProperty("--accent-ink", `color-mix(in srgb, ${hex} 18%, #000)`);
}

export function applyPrefs() {
	const root = document.documentElement;
	// "fern" was the old name for the default palette.
	if (prefs.theme === "fern") prefs.theme = "mint";
	const theme = THEMES.some((t) => t.id === prefs.theme) ? prefs.theme : "mint";

	if (root.dataset.theme !== theme) {
		// Swapping palettes retints every gradient and blur on screen. Letting
		// those transition - and stacking them when you click fast - locks the
		// main thread, so the swap itself is instant.
		root.classList.add("theme-swapping");
		clearTimeout(swapTimer);
		swapTimer = setTimeout(() => root.classList.remove("theme-swapping"), 140);
	}

	root.dataset.theme = theme;
	root.dataset.taskbar = TASKBARS.some((t) => t.id === prefs.taskbar)
		? prefs.taskbar
		: "pill";
	applyMonoAccent(root);
	applyScales(root);
	root.classList.toggle("no-motion", !!prefs.reduceMotion);
	root.classList.toggle("no-grid", !prefs.dotGrid);
	root.classList.toggle("vertical-tabs", !!prefs.verticalTabs);

	try {
		window.dispatchEvent(new CustomEvent("riseub:prefs", { detail: getPrefs() }));
	} catch {}
}

applyPrefs();
