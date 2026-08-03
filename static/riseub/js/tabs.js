import { icon } from "./icons.js";
import {
	ensureScramjet,
	createBrowseFrame,
	isProxyPath,
	parseProxyPath,
} from "./scramjet-shell.js";
import { recordVisit, updateVisitMeta } from "./history.js";

const MAX_TABS = 20;
const META_POLL = 700;
const DRAG_THRESHOLD = 5;
const LOAD_TIMEOUT = 15000;
/** How long a settled page may look empty before we call it a failure. */
const BLANK_GRACE = 2500;
const SESSION_KEY = "riseub-tabs";

let seq = 0;

function prettyName(url) {
	try {
		const u = new URL(url);
		return u.hostname.replace(/^www\./, "") + (u.pathname !== "/" ? u.pathname : "");
	} catch {
		return url;
	}
}

function hostOf(url) {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

function initial(title) {
	const clean = (title || "").trim();
	if (!clean) return "NT";
	const word = clean.replace(/^(https?:\/\/)?(www\.)?/i, "");
	return word.slice(0, 2).toUpperCase();
}

function esc(s) {
	const d = document.createElement("div");
	d.textContent = s == null ? "" : s;
	return d.innerHTML;
}

/**
 * Chrome-style tab strip: independent proxy frame per tab, drag to reorder,
 * live titles and favicons pulled out of the proxied document, and the whole
 * session restored on refresh.
 */
/**
 * One self-contained browser: its own tabs, frames, strip and session. Split
 * view runs a second instance rather than teaching one instance about panes.
 */
export function initTabs({
	frameHost,
	stripList,
	stripNew,
	sideList = null,
	sideNew = null,
	loader,
	sessionKey = SESSION_KEY,
	// Shortcuts only fire for the pane the user is actually working in.
	isFocused = () => true,
}) {
	const tabs = [];
	let activeId = null;
	let saveTimer = null;
	const listeners = new Set();

	function notify() {
		const tab = getActive();
		listeners.forEach((fn) => fn(tab));
		scheduleSave();
	}

	function getActive() {
		return tabs.find((t) => t.id === activeId) || null;
	}

	/* ── Session persistence ────────────────────────────────────── */

	function scheduleSave() {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(save, 350);
	}

	function save() {
		try {
			const payload = {
				tabs: tabs.map((t) => ({
					url: t.url,
					title: t.title,
					favicon: t.favicon,
				})),
				active: Math.max(
					0,
					tabs.findIndex((t) => t.id === activeId)
				),
			};
			localStorage.setItem(sessionKey, JSON.stringify(payload));
		} catch {}
	}

	function loadSession() {
		try {
			const raw = localStorage.getItem(sessionKey);
			if (!raw) return null;
			const data = JSON.parse(raw);
			if (!Array.isArray(data?.tabs) || !data.tabs.length) return null;
			return data;
		} catch {
			return null;
		}
	}

	/* ── Tab lifecycle ──────────────────────────────────────────── */

	function create({ url = null, activate: makeActive = true, restore = null } = {}) {
		if (tabs.length >= MAX_TABS) return getActive();

		const iframe = document.createElement("iframe");
		iframe.className = "tab-frame";
		iframe.title = "Proxied page";
		iframe.setAttribute("allow", "fullscreen; clipboard-read; clipboard-write");
		frameHost.appendChild(iframe);

		const tab = {
			id: `t${++seq}`,
			iframe,
			frame: null,
			url: restore?.url || null,
			title: restore?.title || "New Tab",
			favicon: restore?.favicon || null,
			loading: false,
			// Restored background tabs only fetch once you look at them.
			pending: !!restore?.url,
			error: null,
			token: null,
		};
		tabs.push(tab);
		hookFrame(tab);

		if (makeActive) activeId = tab.id;
		if (url) navigate(url, tab);
		else {
			render();
			notify();
		}
		return tab;
	}

	function close(id) {
		const i = tabs.findIndex((t) => t.id === id);
		if (i === -1) return;
		const [tab] = tabs.splice(i, 1);
		clearTimeout(tab.watchdog);
		tab.iframe.remove();

		if (activeId === id) {
			const next = tabs[i] || tabs[i - 1];
			activeId = next?.id || null;
		}
		if (!tabs.length) {
			loader.cancel();
			create({ activate: true });
			return;
		}

		// Re-issue the loader token: cancelling for the closed tab invalidates
		// the one the surviving tab is holding, which used to hang the overlay.
		syncLoader();
		wake(getActive());
		render();
		notify();
	}

	/** Keep the overlay in step with whichever tab is now in front. */
	function syncLoader() {
		const tab = getActive();
		if (tab?.loading) tab.token = loader.start();
		else loader.cancel();
	}

	function activate(id) {
		if (activeId === id) return;
		activeId = id;
		syncLoader();
		wake(getActive());
		render();
		notify();
	}

	/** Restored tabs load the first time they are looked at. */
	function wake(tab) {
		if (tab?.pending && tab.url) {
			tab.pending = false;
			navigate(tab.url, tab);
		}
	}

	/* ── Navigation ─────────────────────────────────────────────── */

	function beginLoad(tab) {
		tab.loading = true;
		tab.error = null;
		tab.loadStart = Date.now();
		if (tab.id === activeId) {
			tab.token = loader.start();
			notify();
		}
		clearTimeout(tab.watchdog);
		tab.watchdog = setTimeout(() => endLoad(tab, { timedOut: true }), LOAD_TIMEOUT);
		renderStrips();
	}

	function endLoad(tab, { timedOut = false } = {}) {
		clearTimeout(tab.watchdog);
		tab.watchdog = null;
		tab.loading = false;

		const failure = timedOut ? "timeout" : readFailure(tab);
		const host = hostOf(tab.url);

		// The worker occasionally isn't controlling a brand new frame yet, which
		// is what "refreshing fixes it" actually was. Retry once, quietly.
		if (failure === "miss" && (tab.retries || 0) < 1) {
			tab.retries = (tab.retries || 0) + 1;
			setTimeout(() => {
				if (tab.url) navigate(tab.url, tab);
			}, 260);
			return;
		}

		const MESSAGES = {
			timeout: {
				title: "This page took a wrong turn",
				detail: `${host} didn't answer in time. It might be down, blocked, or just very slow.`,
			},
			miss: {
				title: "Couldn't reach that page",
				detail: `Nothing answered for ${host}. Check the address, or search for it instead.`,
			},
			dns: {
				title: "We couldn't find that site",
				detail: `No server answered for ${host}. Check the spelling, or search for it instead.`,
			},
			tls: {
				title: "That connection looks broken",
				detail: `${host} refused a secure connection. It may be down or blocking the proxy.`,
			},
			fetch: {
				title: "Couldn't load that page",
				detail: `${host} didn't send anything back. Give it another go in a moment.`,
			},
			blank: {
				title: "Nothing came back",
				detail: `${host} loaded an empty page. Try again, or search for it instead.`,
			},
		};

		if (failure) {
			tab.error = MESSAGES[failure] || MESSAGES.fetch;
		} else {
			tab.retries = 0;
			recordVisit(tab.url, tab.title, tab.favicon);
		}

		if (tab.id === activeId) {
			loader.done(tab.token);
			notify();
		}
		renderStrips();
	}

	/**
	 * Work out whether the frame is showing a real page or one of the proxy's
	 * raw failure screens, so we can put a human message in front of it.
	 */
	function readFailure(tab) {
		let doc;
		try {
			doc = tab.iframe.contentDocument;
		} catch {
			// Cross-origin means something genuinely rendered.
			return null;
		}
		if (!doc?.body) return "blank";

		const text = doc.body.innerText.trim();

		// Express answered the proxy path - the request escaped the worker.
		if (/^Cannot (GET|POST)\s+\/~\/sj\//i.test(text)) return "miss";

		if (/Internal Service Worker Error|Error in controller/i.test(text)) {
			if (/resolve host|error code 6\b|code 7\b/i.test(text)) return "dns";
			if (/SSL|certificate|error code 35\b|error code 60\b/i.test(text)) return "tls";
			return "fetch";
		}

		// A page mid-render is legitimately empty - only a settled document
		// with nothing in it counts as a failure, and even then we wait a beat.
		if (doc.readyState !== "complete") return null;
		if (
			!text &&
			!doc.body.querySelector("img, svg, canvas, video, iframe, input, button") &&
			Date.now() - (tab.loadStart || 0) > BLANK_GRACE
		) {
			return "blank";
		}

		return null;
	}

	async function navigate(url, tab = getActive()) {
		if (!tab) return;
		tab.url = url;
		tab.title = prettyName(url);
		tab.favicon = null;
		tab.pending = false;
		beginLoad(tab);
		render();

		try {
			await ensureScramjet();
			if (!tab.frame) {
				tab.frame = createBrowseFrame(tab.iframe, {
					onUrl: (next) => onFrameUrl(tab, next),
				});
			}
			tab.frame.go(url);
		} catch (err) {
			tab.error = {
				title: "The proxy isn't ready",
				detail: err?.message || "Reload the page and try again.",
			};
			endLoad(tab);
			return;
		}

		notify();
	}

	function onFrameUrl(tab, url) {
		if (!url) return;
		const changed = tab.url !== url;
		tab.url = url;
		if (changed) {
			tab.title = prettyName(url);
			renderStrips();
			if (tab.id === activeId) notify();
		}
	}

	function hookFrame(tab) {
		tab.iframe.addEventListener("load", () => {
			if (!tab.url) return;
			readMeta(tab);
			endLoad(tab);
			watchUnload(tab);
			if (tab.id === activeId) notify();
		});
	}

	/** Catch link clicks and redirects inside the proxied page. */
	function watchUnload(tab) {
		try {
			const w = tab.iframe.contentWindow;
			if (!w || w._riseubWatched) return;
			w._riseubWatched = true;
			const onLeave = () => {
				w._riseubWatched = false;
				beginLoad(tab);
			};
			w.addEventListener("beforeunload", onLeave, { once: true });
			w.addEventListener("pagehide", onLeave, { once: true });
		} catch {}
	}

	function readMeta(tab) {
		try {
			const doc = tab.iframe.contentDocument;
			if (!doc) return;
			const title = doc.title?.trim();
			if (title) tab.title = title;
			const link = doc.querySelector(
				'link[rel~="icon" i], link[rel~="shortcut" i], link[rel="apple-touch-icon" i]'
			);
			const href = link?.href || "";
			// Pages (and the proxy) often stub in a blank `data:,` icon.
			// The href resolves against the proxy, so unwrap it back to the
			// real address - that's what the image relay needs.
			tab.favicon =
				href && !/^data:,?$/i.test(href)
					? (isProxyPath(new URL(href, location.href).pathname)
							? parseProxyPath(new URL(href, location.href).pathname)
							: href) || null
					: null;
		} catch {}
	}

	function back() {
		const tab = getActive();
		if (!tab?.url) return;
		beginLoad(tab);
		try {
			tab.iframe.contentWindow.history.back();
		} catch {
			endLoad(tab);
		}
	}

	function forward() {
		const tab = getActive();
		if (!tab?.url) return;
		beginLoad(tab);
		try {
			tab.iframe.contentWindow.history.forward();
		} catch {
			endLoad(tab);
		}
	}

	function reload() {
		const tab = getActive();
		if (!tab?.url) return;
		if (!tab.frame || tab.error) {
			navigate(tab.url, tab);
			return;
		}
		beginLoad(tab);
		try {
			tab.iframe.contentWindow.location.reload();
		} catch {
			tab.frame.go(tab.url);
		}
	}

	/* ── Rendering ──────────────────────────────────────────────── */

	function favHtml(tab) {
		if (tab.loading) {
			return `<span class="tab__fav"><span class="tab__spinner"></span></span>`;
		}
		if (tab.favicon) {
			// Through the relay: the raw icon URL is a third-party request from
			// our own origin, which plenty of hosts refuse outright. Letters
			// only appear if the icon itself fails.
			const src = `/api/img?url=${encodeURIComponent(tab.favicon)}`;
			return `<span class="tab__fav"><img src="${esc(src)}" alt="" onerror="this.closest('.tab__fav').textContent='${esc(initial(tab.title))}'" /></span>`;
		}
		// A blank tab has no site to stand for - use the new-tab mark.
		if (!tab.url) {
			return `<span class="tab__fav tab__fav--new">${icon("plus")}</span>`;
		}
		return `<span class="tab__fav">${esc(initial(tab.title))}</span>`;
	}

	/** Tabs seen at least once, so entrance animations only play for new ones. */
	const painted = new Set();

	function tabHtml(tab, cls) {
		const fresh = painted.has(tab.id) ? "" : " is-new";
		return `
			<div class="${cls}${tab.id === activeId ? " is-active" : ""}${fresh}" data-tab="${tab.id}" title="${esc(tab.title)}">
				${favHtml(tab)}
				<span class="tab__title">${esc(tab.title)}</span>
				<button type="button" class="tab__close" data-close="${tab.id}" aria-label="Close tab">${icon("x")}</button>
			</div>`;
	}

	function renderStrips() {
		if (dragging) return;

		stripList.innerHTML = tabs.map((tab) => tabHtml(tab, "tab")).join("");
		if (sideList) sideList.innerHTML = tabs.map((tab) => tabHtml(tab, "side-tab")).join("");
		tabs.forEach((tab) => painted.add(tab.id));

		// Only judge width once the strip actually has layout, otherwise every
		// tab measures 0 while the panel is hidden and the titles vanish.
		if (stripList.offsetWidth > 0) {
			stripList.querySelectorAll(".tab").forEach((node) => {
				node.classList.toggle("is-narrow", node.getBoundingClientRect().width < 78);
			});
		}
	}

	function render() {
		tabs.forEach((tab) => {
			tab.iframe.classList.toggle("is-active", tab.id === activeId);
		});
		renderStrips();
	}

	/* ── Drag to reorder ────────────────────────────────────────── */

	let dragging = null;

	function startDrag(e, list, axis) {
		const node = e.target.closest("[data-tab]");
		if (!node || e.target.closest("[data-close]") || e.button !== 0) return;

		const id = node.dataset.tab;
		const nodes = [...list.children];
		const index = nodes.indexOf(node);
		const rects = nodes.map((n) => n.getBoundingClientRect());
		const size = axis === "x" ? rects[index].width : rects[index].height;
		const gap =
			nodes.length > 1
				? Math.abs(
						axis === "x"
							? rects[1].left - rects[0].right
							: rects[1].top - rects[0].bottom
					)
				: 0;

		dragging = {
			id,
			node,
			nodes,
			rects,
			index,
			target: index,
			axis,
			step: size + gap,
			start: axis === "x" ? e.clientX : e.clientY,
			moved: false,
		};

		activate(id);

		const onMove = (ev) => {
			if (!dragging) return;
			const pos = dragging.axis === "x" ? ev.clientX : ev.clientY;
			const delta = pos - dragging.start;

			if (!dragging.moved && Math.abs(delta) < DRAG_THRESHOLD) return;
			if (!dragging.moved) {
				dragging.moved = true;
				dragging.node.classList.add("is-dragging");
				dragging.nodes.forEach((n) => {
					if (n !== dragging.node) n.classList.add("is-shifting");
				});
			}

			const axisT = dragging.axis === "x" ? "translateX" : "translateY";
			dragging.node.style.transform = `${axisT}(${delta}px)`;

			const shift = Math.round(delta / dragging.step);
			const next = Math.max(
				0,
				Math.min(dragging.nodes.length - 1, dragging.index + shift)
			);
			if (next !== dragging.target) {
				dragging.target = next;
				dragging.nodes.forEach((n, i) => {
					if (i === dragging.index) return;
					let off = 0;
					if (next > dragging.index && i > dragging.index && i <= next) {
						off = -dragging.step;
					} else if (next < dragging.index && i >= next && i < dragging.index) {
						off = dragging.step;
					}
					n.style.transform = off ? `${axisT}(${off}px)` : "";
				});
			}
		};

		const onUp = () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("pointercancel", onUp);
			if (!dragging) return;

			const { index: from, target: to, nodes: n } = dragging;
			n.forEach((el) => {
				el.style.transform = "";
				el.classList.remove("is-dragging", "is-shifting");
			});
			dragging = null;

			if (from !== to) {
				const [moved] = tabs.splice(from, 1);
				tabs.splice(to, 0, moved);
				scheduleSave();
			}
			render();
		};

		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		window.addEventListener("pointercancel", onUp);
	}

	/* ── Wiring ─────────────────────────────────────────────────── */

	function wireList(list, axis) {
		list.addEventListener("pointerdown", (e) => startDrag(e, list, axis));
		list.addEventListener("click", (e) => {
			const closeBtn = e.target.closest("[data-close]");
			if (closeBtn) {
				e.stopPropagation();
				close(closeBtn.dataset.close);
				return;
			}
			const node = e.target.closest("[data-tab]");
			if (node) activate(node.dataset.tab);
		});
		list.addEventListener("auxclick", (e) => {
			if (e.button !== 1) return;
			const node = e.target.closest("[data-tab]");
			if (node) {
				e.preventDefault();
				close(node.dataset.tab);
			}
		});
	}

	wireList(stripList, "x");
	if (sideList) wireList(sideList, "y");
	stripNew.addEventListener("click", () => create({}));
	if (sideNew) sideNew.addEventListener("click", () => create({}));

	window.addEventListener("keydown", (e) => {
		if (!e.ctrlKey && !e.metaKey) return;
		if (!isFocused()) return;
		if (e.key.toLowerCase() === "t") {
			e.preventDefault();
			create({});
		} else if (e.key.toLowerCase() === "w" && tabs.length) {
			e.preventDefault();
			close(activeId);
		} else if (e.key === "Tab") {
			e.preventDefault();
			const i = tabs.findIndex((t) => t.id === activeId);
			const next = tabs[(i + (e.shiftKey ? -1 + tabs.length : 1)) % tabs.length];
			if (next) activate(next.id);
		}
	});

	// Proxied pages change their title long after load; poll cheaply. The same
	// pass closes out loads whose `load` event was swallowed by a redirect hop.
	setInterval(() => {
		let changed = false;
		tabs.forEach((tab) => {
			if (!tab.url || tab.pending) return;
			const before = `${tab.title}|${tab.favicon}`;
			readMeta(tab);
			if (`${tab.title}|${tab.favicon}` !== before) {
				changed = true;
				scheduleSave();
				updateVisitMeta(tab.url, { title: tab.title, favicon: tab.favicon });
			}

			if (tab.loading && Date.now() - (tab.loadStart || 0) > 500) {
				try {
					if (tab.iframe.contentDocument?.readyState === "complete") {
						endLoad(tab);
						watchUnload(tab);
					}
				} catch {}
			}
		});
		if (changed) renderStrips();
	}, META_POLL);

	window.addEventListener("resize", renderStrips);
	window.addEventListener("beforeunload", save);

	return {
		create,
		close,
		activate,
		navigate,
		back,
		forward,
		reload,
		getActive,
		count: () => tabs.length,
		/** Re-measure once the browse panel is visible again. */
		refresh: renderStrips,
		restoreSession() {
			const data = loadSession();
			if (!data) return false;

			data.tabs.slice(0, MAX_TABS).forEach((entry) => {
				create({ activate: false, restore: entry });
			});
			const target = tabs[Math.min(data.active, tabs.length - 1)] || tabs[0];
			activeId = target.id;
			wake(target);
			render();
			notify();
			return true;
		},
		onChange(fn) {
			listeners.add(fn);
			return () => listeners.delete(fn);
		},
	};
}
