import {
	ensureScramjet,
	ensureUtilityFrame,
	isProxyPath,
	parseProxyPath,
	createMediaFrame,
	proxify,
} from "./scramjet-shell.js";
import { icon } from "./icons.js";
import { initMovies } from "./movies.js";
import { initMusic } from "./music.js";
import { initGames } from "./games.js?v=gfiles12";
import { initAi } from "./ai.js";
import { initSettings } from "./settings.js";
import { initTabs } from "./tabs.js";
import { resolveNavigation, initOmnibox } from "./omnibox.js";
import { initProxyLoader } from "./proxy-loader.js";
import { applyPrefs, onPrefsChange } from "./theme.js";
import { apply as applySecurity } from "./security.js";
import { initTray } from "./systray.js";
import { initDock } from "./dock.js";
import { notify } from "./toast.js";
import { requireAccount } from "./auth.js";
import { riseLogo } from "./logo.js";
import { openProfileModal } from "./profile-page.js";
import { awardXp, claimDaily, hasProfile, levelFromXp, getProfile } from "./profile.js";

const form = document.getElementById("sj-form");
const address = document.getElementById("sj-address");
const frameWrapper = document.getElementById("sj-frame-wrapper");
const errorPanel = document.getElementById("sj-error-panel");
const errorText = document.getElementById("sj-error");
const errorCode = document.getElementById("sj-error-code");
const browsePanel = document.getElementById("panel-browse");
const mediaPanel = document.getElementById("panel-media");
const newtabEl = document.getElementById("newtab");
const newtabForm = document.getElementById("newtab-form");
const newtabInput = document.getElementById("newtab-input");
const navLinks = document.querySelectorAll("[data-nav]");
const taskbar = document.getElementById("app-taskbar");
const taskbarIndicator = taskbar.querySelector(".taskbar__indicator");

// Which split pane the keyboard and shortcuts belong to.
let focusPane = "a";

applyPrefs();
applySecurity();

/*
 * Start the proxy handshake immediately rather than behind the account gate:
 * it's memoised, so by the time anything actually needs it the wait is over.
 * Failures are handled at the real call sites.
 */
ensureScramjet().catch(() => {});

/* ── Browser tabs ──────────────────────────────────────────────── */

const loader = initProxyLoader(frameWrapper);

const tabs = initTabs({
	frameHost: frameWrapper,
	stripList: document.getElementById("tab-list"),
	stripNew: document.getElementById("tab-new"),
	sideList: document.getElementById("side-tab-list"),
	sideNew: document.getElementById("side-tab-new"),
	loader,
	isFocused: () => focusPane === "a",
});

tabs.onChange((tab) => {
	const blank = !tab || !tab.url;
	newtabEl.hidden = !blank;
	address.value = tab?.url || "";

	if (tab?.error && !tab.loading) {
		showErrorScreen(tab.error.title, tab.error.detail);
	} else {
		errorPanel.hidden = true;
	}

	if (blank && location.pathname === "/") {
		requestAnimationFrame(() => newtabInput.focus({ preventScroll: true }));
	}
});

function showErrorScreen(message, details) {
	errorPanel.hidden = false;
	errorText.textContent = message;
	errorCode.textContent = details || "";
}

document.getElementById("sj-error-retry").addEventListener("click", () => {
	const tab = tabs.getActive();
	if (tab?.url) tabs.navigate(tab.url, tab);
});

document.getElementById("sj-error-search").addEventListener("click", () => {
	const tab = tabs.getActive();
	let term = tab?.url || "";
	try {
		term = new URL(term).hostname;
	} catch {}
	go(term.replace(/^www\./, "").replace(/\..*$/, "") || "riseub");
});

async function go(input) {
	errorPanel.hidden = true;
	try {
		const resolved = resolveNavigation(input);
		address.value = resolved.kind === "search" ? resolved.query : resolved.label;
		await tabs.navigate(resolved.url);
	} catch (err) {
		loader.cancel();
		showErrorScreen("That address didn't work", err.message);
	}
}

/** Anything that wants a page opened in the browser lands here. */
function openInBrowser(url) {
	navigateTo("/");
	tabs.create({ url });
}

const omnibox = initOmnibox(address, document.getElementById("sj-suggestions"), {
	onGo: (text) => {
		address.value = text;
		form.requestSubmit();
	},
});

initOmnibox(newtabInput, document.getElementById("newtab-suggestions"), {
	onGo: (text) => {
		newtabInput.value = text;
		newtabForm.requestSubmit();
	},
});

form.addEventListener("submit", (e) => {
	e.preventDefault();
	omnibox.hideSuggestions();
	address.blur();
	if (location.pathname !== "/") navigateTo("/");
	go(address.value);
});

newtabForm.addEventListener("submit", (e) => {
	e.preventDefault();
	const value = newtabInput.value;
	newtabInput.value = "";
	newtabInput.blur();
	go(value);
});

/* ── Split view ────────────────────────────────────────────────── */

/*
 * Pane B is a second, fully independent browser: its own tab strip, address
 * bar, frames and saved session. Nothing is shared but the split toggle.
 */
const splitBtn = document.getElementById("sj-split");
const panesEl = document.getElementById("browse-panes");
const paneA = document.getElementById("pane-a");
let paneB = document.getElementById("pane-b");
const paneDivider = document.getElementById("pane-divider");

let tabsB = null;

function setFocusPane(which) {
	focusPane = which;
	paneA.classList.toggle("is-focused", which === "a");
	paneB.classList.toggle("is-focused", which === "b");
}

paneA.addEventListener("pointerdown", () => setFocusPane("a"), true);

/*
 * A click landing inside a frame never reaches us, but focus does move to that
 * iframe - so the window losing focus tells us which pane was clicked into.
 */
window.addEventListener("blur", () => {
	setTimeout(() => {
		const el = document.activeElement;
		if (!el || el.tagName !== "IFRAME") return;
		if (paneB.contains(el)) setFocusPane("b");
		else if (paneA.contains(el)) setFocusPane("a");
	}, 0);
});

/**
 * Pane B is a clone of pane A's whole chrome - tab strip, sidebar, address
 * bar, new-tab page, loader and error panel - with every id suffixed. Cloning
 * beats hand-writing a second copy: it can't drift out of step, and it picks
 * up the same CSS for free.
 */
function ensurePaneB() {
	if (tabsB) return tabsB;

	const clone = paneA.cloneNode(true);
	clone.id = "pane-b";
	clone.hidden = false;
	clone.classList.remove("is-focused");
	// Nested ids would otherwise collide with pane A's.
	clone.querySelectorAll("[id]").forEach((node) => {
		node.id = `${node.id}-b`;
	});
	// One split toggle is enough, and it belongs to pane A.
	clone.querySelector("#sj-split-b")?.remove();
	// Frames don't survive a clone in a usable state.
	clone.querySelectorAll(".tab-frame").forEach((f) => f.remove());
	/*
	 * Split while pane A is mid-load and the clone inherits a *visible* loader
	 * that nothing owns - it would sit there spinning forever. Reset any
	 * transient overlay state the copy picked up.
	 */
	clone.querySelectorAll('.proxy-loader, [id^="sj-error-panel"]').forEach((node) => {
		node.hidden = true;
		node.classList.remove("is-visible", "is-hiding");
	});
	clone.querySelectorAll(".tabstrip__list, .side-tabs").forEach((l) => {
		l.innerHTML = "";
	});
	paneB.replaceWith(clone);
	paneB = clone;

	const $ = (id) => clone.querySelector(`#${id}-b`);
	const addressB = $("sj-address");
	const formB = $("sj-form");
	const hostB = $("sj-frame-wrapper");
	const newtabB = $("newtab");
	const errorB = $("sj-error-panel");
	const loaderB = initProxyLoader(hostB);

	tabsB = initTabs({
		frameHost: hostB,
		stripList: $("tab-list"),
		stripNew: $("tab-new"),
		sideList: $("side-tab-list"),
		sideNew: $("side-tab-new"),
		loader: loaderB,
		sessionKey: "riseub-tabs-b",
		isFocused: () => focusPane === "b",
	});

	tabsB.onChange((tab) => {
		newtabB.hidden = !!tab?.url;
		addressB.value = tab?.url || "";
		if (tab?.error && !tab.loading) {
			errorB.hidden = false;
			$("sj-error").textContent = tab.error.title;
			$("sj-error-code").textContent = tab.error.detail || "";
		} else {
			errorB.hidden = true;
		}
	});

	async function goB(input) {
		errorB.hidden = true;
		try {
			const resolved = resolveNavigation(input);
			addressB.value = resolved.kind === "search" ? resolved.query : resolved.label;
			await tabsB.navigate(resolved.url);
		} catch (err) {
			loaderB.cancel();
			notify("That address didn't work", err.message, "error");
		}
	}

	const omniB = initOmnibox(addressB, $("sj-suggestions"), {
		onGo: (text) => {
			addressB.value = text;
			formB.requestSubmit();
		},
	});
	formB.addEventListener("submit", (e) => {
		e.preventDefault();
		omniB.hideSuggestions();
		addressB.blur();
		goB(addressB.value);
	});

	// The cloned new-tab page needs its own search box and quick links wired.
	const ntInput = $("newtab-input");
	const ntForm = $("newtab-form");
	initOmnibox(ntInput, $("newtab-suggestions"), {
		onGo: (text) => {
			ntInput.value = text;
			ntForm.requestSubmit();
		},
	});
	ntForm.addEventListener("submit", (e) => {
		e.preventDefault();
		const value = ntInput.value;
		ntInput.value = "";
		ntInput.blur();
		goB(value);
	});
	$("newtab-logo").innerHTML = riseLogo();
	clone.querySelectorAll("[data-nav-to]").forEach((btn) => {
		btn.addEventListener("click", () => navigateTo(btn.dataset.navTo));
	});

	$("sj-back").addEventListener("click", () => tabsB.back());
	$("sj-forward").addEventListener("click", () => tabsB.forward());
	$("sj-reload").addEventListener("click", () => tabsB.reload());
	$("sj-error-retry").addEventListener("click", () => {
		const tab = tabsB.getActive();
		if (tab?.url) tabsB.navigate(tab.url, tab);
	});
	$("sj-error-search").addEventListener("click", () => {
		const tab = tabsB.getActive();
		let term = tab?.url || "";
		try {
			term = new URL(term).hostname;
		} catch {}
		goB(term.replace(/^www\./, "").replace(/\..*$/, "") || "riseub");
	});

	paneB.addEventListener("pointerdown", () => setFocusPane("b"), true);

	if (!tabsB.restoreSession()) tabsB.create({});
	return tabsB;
}

const SPLIT_KEY = "riseub-split";

function setSplit(on, { save = true } = {}) {
	// ensurePaneB replaces the placeholder node, so build before touching it.
	if (on) ensurePaneB();

	panesEl.classList.toggle("is-split", on);
	document.documentElement.classList.toggle("split-view", on);
	paneB.hidden = !on;
	splitBtn.classList.toggle("on", on);
	splitBtn.setAttribute("aria-pressed", String(on));

	if (save) {
		try {
			const ratio = panesEl.style.getPropertyValue("--split");
			localStorage.setItem(SPLIT_KEY, on ? JSON.stringify({ on, ratio }) : "");
		} catch {}
	}

	if (on) {
		// Both strips measured 0 while hidden - re-measure now they have layout.
		setTimeout(() => {
			tabs.refresh();
			tabsB.refresh();
		}, 16);
	} else {
		setFocusPane("a");
		panesEl.style.removeProperty("--split");
	}
}

splitBtn.addEventListener("click", () => {
	setSplit(!panesEl.classList.contains("is-split"));
});

/** Bring the split back exactly as it was left, seam position included. */
function restoreSplit() {
	let saved = null;
	try {
		saved = JSON.parse(localStorage.getItem(SPLIT_KEY) || "null");
	} catch {}
	if (!saved?.on) return;
	setSplit(true, { save: false });
	if (saved.ratio) panesEl.style.setProperty("--split", saved.ratio);
}

/*
 * Drag the seam. Frames swallow pointer events mid-drag, so they're disabled
 * for the duration while the divider keeps capture.
 */
paneDivider.addEventListener("pointerdown", (e) => {
	e.preventDefault();
	paneDivider.setPointerCapture(e.pointerId);
	panesEl.classList.add("is-resizing");

	const move = (ev) => {
		const box = panesEl.getBoundingClientRect();
		const ratio = ((ev.clientX - box.left) / box.width) * 100;
		panesEl.style.setProperty("--split", `${Math.max(20, Math.min(80, ratio))}%`);
	};
	const up = () => {
		panesEl.classList.remove("is-resizing");
		// Remember where the seam ended up.
		setSplit(true);
		paneDivider.removeEventListener("pointermove", move);
		paneDivider.removeEventListener("pointerup", up);
		paneDivider.removeEventListener("pointercancel", up);
	};

	paneDivider.addEventListener("pointermove", move);
	paneDivider.addEventListener("pointerup", up);
	paneDivider.addEventListener("pointercancel", up);
});

// Double-click puts the seam back in the middle.
paneDivider.addEventListener("dblclick", () => {
	panesEl.style.removeProperty("--split");
	setSplit(true);
});

document.getElementById("sj-back").addEventListener("click", () => tabs.back());
document
	.getElementById("sj-forward")
	.addEventListener("click", () => tabs.forward());
document.getElementById("sj-reload").addEventListener("click", () => tabs.reload());

/* ── Views ─────────────────────────────────────────────────────── */

function placeholder(host, { name, title, text, tag }) {
	host.innerHTML = `
		<div class="placeholder">
			<div class="placeholder__card">
				<div class="placeholder__icon">${icon(name)}</div>
				<h2>${title}</h2>
				<p>${text}</p>
				<span class="placeholder__tag">${tag}</span>
			</div>
		</div>`;
	return { destroy: () => host.remove() };
}

const VIEWS = {
	"/movies": (host) =>
		initMovies(host, {
			ensureScramjet: () => ensureScramjet(),
			createMediaFrame,
			ensureUtilityFrame,
			proxify,
		}),
	"/music": (host) =>
		initMusic(host, {
			ensureScramjet: async () => {
				await ensureScramjet();
				return ensureUtilityFrame();
			},
			proxify,
		}),
	"/games": (host) =>
		initGames(host, {
			ensureScramjet: () => ensureScramjet(),
			createMediaFrame,
		}),
	"/ai": (host) =>
		initAi(host, {
			ensureScramjet: async () => {
				await ensureScramjet();
				return ensureUtilityFrame();
			},
			proxify,
		}),
	"/settings": (host) => initSettings(host),
	"/profile": (host) => {
		openProfileModal();
		return { destroy: () => host.remove() };
	},
};

/** Each view keeps its own container so switching never wipes the others. */
const views = new Map();

function showView(path) {
	views.forEach((view, key) => {
		const on = key === path;
		const wasHidden = view.el.hidden;
		view.el.hidden = !on;
		if (on && wasHidden) view.api?.onShow?.();
		if (!on && !wasHidden) view.api?.onHide?.();
	});

	if (!VIEWS[path]) return;

	if (!views.has(path)) {
		const el = document.createElement("div");
		el.className = "view";
		mediaPanel.appendChild(el);
		const api = VIEWS[path](el);
		views.set(path, { el, api });
	} else {
		// Replay the entrance animation on return.
		const { el } = views.get(path);
		el.style.animation = "none";
		void el.offsetWidth;
		el.style.animation = "";
	}
}

/* ── Routing ───────────────────────────────────────────────────── */

function syncTaskbar() {
	const active = taskbar.querySelector(".taskbar__item.on");
	if (!active) {
		taskbar.classList.remove("is-ready");
		return;
	}
	const bar = taskbar.getBoundingClientRect();
	const item = active.getBoundingClientRect();
	const vertical = ["left", "right"].includes(document.documentElement.dataset.taskbar);

	if (vertical) {
		taskbarIndicator.style.width = "";
		taskbarIndicator.style.transform = `translateY(${item.top - bar.top}px)`;
	} else {
		taskbarIndicator.style.width = `${item.width}px`;
		taskbarIndicator.style.transform = `translateX(${item.left - bar.left}px)`;
	}
	taskbar.classList.add("is-ready");
}

function route() {
	let path = location.pathname.replace(/\/+$/, "") || "/";
	if (path !== "/" && !VIEWS[path]) path = "/";

	navLinks.forEach((a) => {
		a.classList.toggle("on", a.getAttribute("href") === path);
	});
	syncTaskbar();

	const isBrowse = path === "/";
	browsePanel.hidden = !isBrowse;
	mediaPanel.hidden = isBrowse;

	if (isBrowse) {
		// Media views stay mounted (music keeps playing) but Games should hush.
		views.forEach((view) => {
			if (!view.el.hidden) view.api?.onHide?.();
			view.el.hidden = true;
		});
		// The strip measures 0 while hidden - re-measure now it has layout.
		requestAnimationFrame(() => tabs.refresh());
		const tab = tabs.getActive();
		if (tab && !tab.url) {
			requestAnimationFrame(() => newtabInput.focus({ preventScroll: true }));
		}
		return;
	}

	showView(path);
}

function navigateTo(href) {
	if (href === location.pathname) return;
	history.pushState(null, "", href);
	route();
}

navLinks.forEach((a) => {
	a.addEventListener("click", (e) => {
		e.preventDefault();
		navigateTo(a.getAttribute("href"));
	});
});

document.querySelectorAll("[data-nav-to]").forEach((btn) => {
	btn.addEventListener("click", () => navigateTo(btn.dataset.navTo));
});

window.addEventListener("popstate", route);
window.addEventListener("resize", syncTaskbar);
document.fonts?.ready.then(syncTaskbar);
onPrefsChange(() => {
	syncTaskbar();
	// The Rise favicon follows the accent, so repaint it on a theme swap.
	applySecurity();
});

window.addEventListener("riseub:navigate", (e) => navigateTo(e.detail));
window.addEventListener("riseub:open-url", (e) => openInBrowser(e.detail));

/* ── Shell furniture ───────────────────────────────────────────── */

initTray({ onOpenUrl: openInBrowser });
initDock({ onOpenProfile: () => openProfileModal() });

document.getElementById("newtab-logo").innerHTML = riseLogo();

/* ── Levelling hooks ───────────────────────────────────────────── */

/** Award XP and shout about it when a level actually lands. */
function grant(kind) {
	if (!hasProfile()) return;
	const jump = awardXp(kind);
	if (!jump) return;
	notify(
		`Level ${jump.to}`,
		`${getProfile()?.username || "You"} levelled up - check your profile for new unlocks`,
		"success"
	);
}

let lastCounted = "";
tabs.onChange((tab) => {
	// One award per page, not per title update.
	if (!tab?.url || tab.loading || tab.url === lastCounted) return;
	lastCounted = tab.url;
	grant("page");
});

window.addEventListener("riseub:xp", (e) => grant(e.detail));

// Time actually spent with the window focused, banked once a minute.
let focusedMs = 0;
let focusMark = document.hasFocus() ? Date.now() : null;

window.addEventListener("focus", () => {
	focusMark = Date.now();
});
window.addEventListener("blur", () => {
	if (focusMark) focusedMs += Date.now() - focusMark;
	focusMark = null;
});

setInterval(() => {
	if (focusMark) {
		focusedMs += Date.now() - focusMark;
		focusMark = Date.now();
	}
	while (focusedMs >= 60000) {
		focusedMs -= 60000;
		grant("focus");
	}
}, 15000);

/* ── Boot ──────────────────────────────────────────────────────── */

const landedOnProxy = isProxyPath(location.pathname);
const proxyTarget = landedOnProxy ? parseProxyPath(location.pathname) : null;
if (landedOnProxy) history.replaceState(null, "", "/");

route();
// Independent of the proxy handshake, so a refresh never quietly undoes it.
restoreSplit();

// Nothing runs until there's an account on this device.
requireAccount().then((justSignedUp) => {
	if (justSignedUp) {
		notify(
			"Welcome to RiseUB",
			`You're level ${levelFromXp(0)} - browse, watch and listen to climb`,
			"success"
		);
	} else {
		claimDaily();
	}

	ensureScramjet()
		.then(() => {
			const embedTarget = window.__RISEUB_EMBED_TARGET || "";
			if (embedTarget) {
				tabs.create({ url: embedTarget });
				return;
			}
			if (proxyTarget) {
				tabs.create({ url: proxyTarget });
				return;
			}
			// Bring last session's tabs back, otherwise open a fresh one.
			if (!tabs.restoreSession()) tabs.create({});
		})
		.catch((err) => {
			tabs.create({});
			showErrorScreen(
				"The proxy didn't start",
				err?.message || "Reload the page to try again."
			);
			notify("Proxy failed to start", "Reload the page to try again", "error");
		});
});
