import { THEMES, TASKBARS, SEARCH_ENGINES, getPrefs, setPref, onPrefsChange } from "./rise-theme.js";

const SECTIONS = [
	{ id: "appearance", label: "Appearance" },
	{ id: "browser", label: "Browser" },
];

const MONO_PRESETS = ["#9aa3ab", "#7ff0c4", "#5b9dff", "#a78bfa", "#ff7a3d", "#fb7185", "#e0c097"];

function esc(s) {
	const d = document.createElement("div");
	d.textContent = s == null ? "" : s;
	return d.innerHTML;
}

function switchHtml(key, on) {
	return `<button type="button" class="switch${on ? " on" : ""}" data-toggle="${key}" role="switch" aria-checked="${on}"></button>`;
}

function themeGrid(prefs) {
	return `<div class="theme-grid">${THEMES.map(
		(t) => `
		<button type="button" class="theme-card${prefs.theme === t.id ? " on" : ""}" data-theme-pick="${t.id}">
			<span class="theme-card__check">✓</span>
			<span class="theme-card__dots">${t.swatches.map((c) => `<span class="theme-card__dot" style="background:${c}"></span>`).join("")}</span>
			<span class="theme-card__text"><strong>${esc(t.label)}</strong><span class="theme-card__desc">${esc(t.desc)}</span></span>
		</button>`,
	).join("")}</div>`;
}

function monoPicker(prefs) {
	const hex = prefs.monoAccent || "#9aa3ab";
	return `<div class="accent-pick">
		<label class="accent-pick__swatch" style="background:${esc(hex)}"><input type="color" value="${esc(hex)}" data-accent /></label>
		<div class="accent-pick__meta"><strong>Accent colour</strong><span>${esc(hex.toUpperCase())}</span></div>
		<div class="accent-pick__presets">${MONO_PRESETS.map((c) => `<button type="button" class="accent-pick__preset" style="background:${c}" data-preset="${c}"></button>`).join("")}</div>
	</div>`;
}

function taskbarPicker(prefs) {
	return `<div class="chip-row">${TASKBARS.map(
		(t) => `<button type="button" class="chip${prefs.taskbar === t.id ? " on" : ""}" data-taskbar-pick="${t.id}">${esc(t.label)}</button>`,
	).join("")}</div>`;
}

function enginePicker(prefs) {
	return `<div class="chip-row">${SEARCH_ENGINES.map(
		(e) => `<button type="button" class="chip${prefs.searchEngine === e.id ? " on" : ""}" data-engine-pick="${e.id}">${esc(e.label)}</button>`,
	).join("")}</div>`;
}

function paneAppearance(prefs) {
	return `<div class="settings__pane">
		<section class="card-block"><div class="card-block__head"><div><h3>Color Theme</h3><p>Sets the accent everywhere. Mono lets you pick your own colour.</p></div></div><div class="card-block__body">${themeGrid(prefs)}${prefs.theme === "mono" ? monoPicker(prefs) : ""}</div></section>
		<section class="card-block"><div class="card-block__head"><div><h3>Taskbar Style</h3><p>${esc(TASKBARS.find((t) => t.id === prefs.taskbar)?.blurb || "")}</p></div></div><div class="card-block__body">${taskbarPicker(prefs)}</div></section>
		<section class="card-block"><div class="card-block__head"><div><h3>Vertical Tabs</h3><p>Tabs go down the left side instead of across the top.</p></div>${switchHtml("verticalTabs", prefs.verticalTabs)}</div></section>
		<section class="card-block"><div class="card-block__head"><div><h3>Reduce Motion</h3><p>Kills the animations. Handy on a slow machine.</p></div>${switchHtml("reduceMotion", prefs.reduceMotion)}</div></section>
		<section class="card-block"><div class="card-block__head"><div><h3>Blur Effects</h3><p>Frosted panels look nice but cost frames.</p></div>${switchHtml("blur", prefs.blur)}</div></section>
	</div>`;
}

function paneBrowser(prefs) {
	return `<div class="settings__pane">
		<section class="card-block"><div class="card-block__head"><div><h3>Search Engine</h3><p>Anything that is not a URL goes here.</p></div></div><div class="card-block__body">${enginePicker(prefs)}</div></section>
	</div>`;
}

export function initSettings(root) {
	let section = "appearance";
	const el = document.createElement("div");
	el.className = "settings";

	function render() {
		const prefs = getPrefs();
		el.innerHTML = `
			<div class="settings__head"><h1 class="settings__title">Settings</h1><p class="settings__sub">Tune Rise to your liking. Everything saves locally.</p></div>
			<div class="settings__inner">
				<nav class="settings__nav">${SECTIONS.map((s) => `<button type="button" class="settings__navbtn${section === s.id ? " on" : ""}" data-section="${s.id}">${esc(s.label)}</button>`).join("")}</nav>
				<div class="settings__body">${section === "appearance" ? paneAppearance(prefs) : paneBrowser(prefs)}</div>
			</div>`;
		bind();
	}

	function bind() {
		el.querySelectorAll("[data-section]").forEach((btn) => {
			btn.addEventListener("click", () => {
				section = btn.dataset.section;
				render();
			});
		});
		el.querySelectorAll("[data-theme-pick]").forEach((btn) => {
			btn.addEventListener("click", () => {
				setPref("theme", btn.dataset.themePick);
				render();
			});
		});
		el.querySelectorAll("[data-taskbar-pick]").forEach((btn) => {
			btn.addEventListener("click", () => {
				setPref("taskbar", btn.dataset.taskbarPick);
				render();
			});
		});
		el.querySelectorAll("[data-engine-pick]").forEach((btn) => {
			btn.addEventListener("click", () => setPref("searchEngine", btn.dataset.enginePick));
		});
		el.querySelectorAll("[data-toggle]").forEach((btn) => {
			btn.addEventListener("click", () => {
				const key = btn.dataset.toggle;
				setPref(key, !getPrefs()[key]);
				btn.classList.toggle("on", getPrefs()[key]);
				btn.setAttribute("aria-checked", String(getPrefs()[key]));
			});
		});
		el.querySelector("[data-accent]")?.addEventListener("input", (e) => setPref("monoAccent", e.target.value));
		el.querySelectorAll("[data-preset]").forEach((btn) => {
			btn.addEventListener("click", () => setPref("monoAccent", btn.dataset.preset));
		});
	}

	onPrefsChange(() => {
		if (section === "appearance") render();
		else {
			el.querySelectorAll(".chip").forEach((chip) => {
				if (chip.dataset.taskbarPick) chip.classList.toggle("on", chip.dataset.taskbarPick === getPrefs().taskbar);
				if (chip.dataset.enginePick) chip.classList.toggle("on", chip.dataset.enginePick === getPrefs().searchEngine);
			});
		}
		syncTaskbarIndicator();
	});

	render();
	root.appendChild(el);
}

export function syncTaskbarIndicator() {
	const bar = document.getElementById("app-taskbar");
	const indicator = bar?.querySelector(".taskbar__indicator");
	const active = bar?.querySelector(".taskbar__item.on");
	if (!bar || !indicator || !active) return;
	bar.classList.add("is-ready");
	const left = active.offsetLeft;
	indicator.style.width = `${active.offsetWidth}px`;
	indicator.style.transform = `translateX(${left}px)`;
}
