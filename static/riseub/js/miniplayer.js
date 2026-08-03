import { icon } from "./icons.js";
import { getPlayer, onPlayerState, getState } from "./player-bus.js";
import { contextMenu } from "./modal.js";
import { notify } from "./toast.js";
import { getPrefs, onPrefsChange } from "./theme.js";
import { ensureUtilityFrame, proxify } from "./scramjet-shell.js";

function esc(s) {
	const d = document.createElement("div");
	d.textContent = s == null ? "" : s;
	return d.innerHTML;
}

/** Same-origin image relay - works in PiP/pop-out where Scramjet SW does not. */
function relayArt(url) {
	if (!url) return "";
	if (url.startsWith("data:") || url.startsWith("blob:")) return url;
	if (url.startsWith("/api/img")) return url;
	return `/api/img?url=${encodeURIComponent(url)}`;
}

function artHtml(url, { popout = false } = {}) {
	if (!url) return icon("music");
	let src = url;
	if (popout) {
		src = relayArt(url);
	} else {
		try {
			src = proxify(url) || url;
		} catch {
			src = relayArt(url);
		}
	}
	return `<img src="${esc(src)}" alt="" data-art-img />`;
}

function fmt(sec) {
	const s = Math.max(0, Math.floor(sec || 0));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function initMiniPlayer(host) {
	let open = false;
	let popWindow = null;
	ensureUtilityFrame().catch(() => {});

	const button = document.createElement("button");
	button.type = "button";
	button.className = "systray__btn systray__music";
	button.title = "Now playing";
	button.setAttribute("aria-label", "Now playing");
	button.hidden = true;
	button.innerHTML = `${icon("music")}<span class="systray__eq"><i></i><i></i><i></i></span>`;
	host.appendChild(button);

	const panel = document.createElement("div");
	panel.className = "mini-panel";
	panel.hidden = true;
	panel.innerHTML = `
		<header class="mini__head">
			<span class="mini__label">${icon("disc")}<span>Now playing</span></span>
			<button type="button" class="mini__dots" aria-label="More">
				<svg class="lucide" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none"/></svg>
			</button>
		</header>
		<div class="mini__body">
			<div class="mini__art" data-art>${icon("music")}</div>
			<div class="mini__meta">
				<strong data-title>Nothing playing</strong>
				<span data-artist>-</span>
			</div>
		</div>
		<div class="mini__bar" data-bar><div data-fill></div></div>
		<div class="mini__times"><span data-elapsed>0:00</span><span data-total>0:00</span></div>
		<div class="mini__controls">
			<button type="button" class="mini__btn" data-prev aria-label="Previous">${icon("chevronLeft")}</button>
			<button type="button" class="mini__play" data-play aria-label="Play">${icon("play", "lucide--fill")}</button>
			<button type="button" class="mini__btn" data-next aria-label="Next">${icon("chevronRight")}</button>
		</div>`;
	document.body.appendChild(panel);

	const artEl = panel.querySelector("[data-art]");
	const titleEl = panel.querySelector("[data-title]");
	const artistEl = panel.querySelector("[data-artist]");
	const fillEl = panel.querySelector("[data-fill]");
	const barEl = panel.querySelector("[data-bar]");
	const elapsedEl = panel.querySelector("[data-elapsed]");
	const totalEl = panel.querySelector("[data-total]");
	const playBtn = panel.querySelector("[data-play]");

	/* ── State ──────────────────────────────────────────────────── */

	function paint(state) {
		const has = !!state.track;
		button.hidden = !has;
		button.classList.toggle("is-playing", state.playing);

		if (!has) {
			if (open) setOpen(false);
			return;
		}

		artEl.innerHTML = artHtml(state.track.artwork);
		titleEl.textContent = state.track.title || "Unknown";
		artistEl.textContent = state.track.artist || "-";
		playBtn.innerHTML = icon(state.playing ? "pause" : "play", "lucide--fill");
		const pct = state.duration ? (state.position / state.duration) * 100 : 0;
		fillEl.style.width = `${pct}%`;
		elapsedEl.textContent = fmt(state.position);
		totalEl.textContent = fmt(state.duration);

		if (popWindow && !popWindow.closed) paintPopout(state);
	}

	panel.addEventListener(
		"error",
		(e) => {
			const img = e.target;
			if (!(img instanceof HTMLImageElement) || !img.hasAttribute("data-art-img")) return;
			img.parentElement && (img.parentElement.innerHTML = icon("music"));
		},
		true
	);

	onPlayerState(paint);

	// Theme or pop-out style changed while it is open - repaint in place.
	onPrefsChange(() => {
		if (!popWindow || popWindow.closed) return;
		popWindow.document.body.dataset.shell = "";
		paintPopout(getState());
	});

	/* ── Controls ───────────────────────────────────────────────── */

	panel.querySelector("[data-play]").addEventListener("click", () => getPlayer()?.toggle());
	panel.querySelector("[data-prev]").addEventListener("click", () => getPlayer()?.prev());
	panel.querySelector("[data-next]").addEventListener("click", () => getPlayer()?.next());
	barEl.addEventListener("click", (e) => {
		const rect = barEl.getBoundingClientRect();
		getPlayer()?.seekRatio((e.clientX - rect.left) / rect.width);
	});

	panel.querySelector(".mini__dots").addEventListener("click", (e) => {
		e.stopPropagation();
		const rect = e.currentTarget.getBoundingClientRect();
		contextMenu(rect.left - 130, rect.bottom + 6, [
			{ label: "Pop out", icon: "layers", run: popOut },
			{
				label: "Open music",
				icon: "music",
				run: () => {
					setOpen(false);
					window.dispatchEvent(new CustomEvent("riseub:navigate", { detail: "/music" }));
				},
			},
		]);
	});

	/* ── Pop-out window ─────────────────────────────────────────── */

	/** Long titles scroll rather than truncate, like a real player. */
	function marquee(text) {
		const safe = esc(text);
		const long = text.length > 22;
		return `<strong class="pop__title${long ? " is-scrolling" : ""}"><span>${safe}${
			long ? `<i aria-hidden="true">${safe}</i>` : ""
		}</span></strong>`;
	}

	function controlsMarkup(state) {
		return `
			<div class="pop__controls">
				<button type="button" data-pop="prev" aria-label="Previous">${icon("chevronLeft")}</button>
				<button type="button" data-pop="toggle" class="pop__play" aria-label="Play/pause">${icon(state.playing ? "pause" : "play", "lucide--fill")}</button>
				<button type="button" data-pop="next" aria-label="Next">${icon("chevronRight")}</button>
			</div>`;
	}

	function popoutMarkup(state) {
		const art = artHtml(state.track?.artwork, { popout: true });
		const pct = state.duration ? (state.position / state.duration) * 100 : 0;
		const title = state.track?.title || "Nothing playing";
		const artist = state.track?.artist || "-";

		// "card" mirrors the now-playing sidebar; "bar" is the compact strip.
		if (getPrefs().popoutStyle === "card") {
			return `
				<div class="pop pop--card">
					<div class="pop__cover">${art}</div>
					<div class="pop__meta">
						${marquee(title)}
						<span>${esc(artist)}</span>
					</div>
					<div class="pop__bar" data-pop-bar><div style="width:${pct}%"></div></div>
					${controlsMarkup(state)}
				</div>`;
		}

		return `
			<div class="pop">
				<div class="pop__art">${art}</div>
				<div class="pop__meta">
					${marquee(title)}
					<span>${esc(artist)}</span>
					<div class="pop__bar" data-pop-bar><div style="width:${pct}%"></div></div>
				</div>
				${controlsMarkup(state)}
			</div>`;
	}

	function paintPopout(state) {
		const doc = popWindow?.document;
		if (!doc?.body) return;

		// Only the moving parts get touched once the shell is up, so the
		// marquee doesn't restart on every tick.
		const shellKey = `${getPrefs().popoutStyle}|${state.track?.id || ""}|${state.track?.artwork || ""}`;
		if (doc.body.dataset.shell !== shellKey) {
			doc.body.dataset.shell = shellKey;
			doc.body.innerHTML = popoutMarkup(state);
			doc.querySelectorAll("[data-pop]").forEach((btn) => {
				btn.addEventListener("click", () => {
					const p = getPlayer();
					if (!p) return;
					if (btn.dataset.pop === "toggle") p.toggle();
					else if (btn.dataset.pop === "prev") p.prev();
					else p.next();
				});
			});
			doc.querySelector("[data-pop-bar]")?.addEventListener("click", (e) => {
				const bar = e.currentTarget.getBoundingClientRect();
				getPlayer()?.seekRatio((e.clientX - bar.left) / bar.width);
			});
		}

		const fill = doc.querySelector("[data-pop-bar] div");
		if (fill) {
			fill.style.width = `${state.duration ? (state.position / state.duration) * 100 : 0}%`;
		}
		const play = doc.querySelector('[data-pop="toggle"]');
		if (play) play.innerHTML = icon(state.playing ? "pause" : "play", "lucide--fill");

		syncPopTheme();
	}

	/**
	 * The pop-out is its own window, so the app's key handlers never see it.
	 * Give it the same transport shortcuts: space toggles, arrows skip.
	 */
	function bindPopKeys(w) {
		w.addEventListener(
			"keydown",
			(e) => {
				const player = getPlayer();
				if (!player) return;
				if (e.code === "Space" || e.key === " ") {
					e.preventDefault();
					player.toggle();
				} else if (e.key === "ArrowRight") {
					e.preventDefault();
					player.next();
				} else if (e.key === "ArrowLeft") {
					e.preventDefault();
					player.prev();
				}
			},
			true
		);
	}

	/** Keep the pop-out on the same palette as the app. */
	function syncPopTheme() {
		const doc = popWindow?.document;
		if (!doc?.documentElement) return;
		const from = document.documentElement;
		doc.documentElement.dataset.theme = from.dataset.theme;
		["--accent", "--accent-hi", "--accent-deep", "--accent-rgb", "--accent-ink"].forEach(
			(name) => {
				const value = from.style.getPropertyValue(name);
				if (value) doc.documentElement.style.setProperty(name, value);
				else doc.documentElement.style.removeProperty(name);
			}
		);
	}

	function copyStyles(doc) {
		[...document.styleSheets].forEach((sheet) => {
			try {
				const css = [...sheet.cssRules].map((r) => r.cssText).join("");
				const style = doc.createElement("style");
				style.textContent = css;
				doc.head.appendChild(style);
			} catch {
				if (sheet.href) {
					const link = doc.createElement("link");
					link.rel = "stylesheet";
					link.href = sheet.href;
					doc.head.appendChild(link);
				}
			}
		});
		const theme = document.documentElement.dataset.theme;
		doc.documentElement.dataset.theme = theme;
		const base = doc.createElement("style");
		base.textContent = `
			html,body{margin:0;height:100%;background:var(--bg,#0a0c0b);color:var(--text,#f2f4f5);
				font-family:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow:hidden}`;
		doc.head.appendChild(base);
	}

	async function popOut() {
		setOpen(false);
		const state = getState();

		const card = getPrefs().popoutStyle === "card";
		const w = card ? 340 : 380;
		const h = card ? 430 : 190;

		try {
			if (window.documentPictureInPicture?.requestWindow) {
				popWindow = await window.documentPictureInPicture.requestWindow({
					width: w,
					height: h,
				});
			} else {
				popWindow = window.open(
					"",
					"riseub-mini-player",
					`width=${w},height=${h},alwaysRaised=yes,menubar=no,toolbar=no,location=no,status=no`
				);
				if (popWindow) popWindow.document.title = "RiseUB - Now playing";
			}
		} catch {
			popWindow = null;
		}

		if (!popWindow) {
			notify("Pop-out blocked", "Allow pop-ups for this site and try again", "error");
			return;
		}

		copyStyles(popWindow.document);
		paintPopout(state);
		bindPopKeys(popWindow);
		popWindow.addEventListener("pagehide", () => {
			popWindow = null;
		});
	}

	/* ── Open / close ───────────────────────────────────────────── */

	function setOpen(next) {
		open = next;
		button.classList.toggle("is-on", open);
		if (open) {
			paint(getState());
			panel.hidden = false;
			setTimeout(() => panel.classList.add("is-open"), 16);
		} else {
			panel.classList.remove("is-open");
			setTimeout(() => {
				if (!open) panel.hidden = true;
			}, 260);
		}
	}

	button.addEventListener("click", (e) => {
		e.stopPropagation();
		setOpen(!open);
	});

	document.addEventListener("pointerdown", (e) => {
		if (!open) return;
		if (panel.contains(e.target) || button.contains(e.target)) return;
		if (e.target.closest(".ctx-menu")) return;
		setOpen(false);
	});

	return {
		close: () => setOpen(false),
	};
}
