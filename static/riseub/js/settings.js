import { icon } from "./icons.js";
import { THEMES, TASKBARS, getPrefs, setPref } from "./theme.js";
import { confirmModal, promptModal } from "./modal.js";
import { dropdown } from "./dropdown.js";
import { notify } from "./toast.js";
import { getHistory, clearHistory, removeVisit } from "./history.js";
import { exportVault, readAccessToken, storeAccessToken } from "./save-vault.js";
import { getProfile } from "./profile.js";
import { SEARCH_ENGINES } from "./omnibox.js";
import {
	MASKS,
	getSecurity,
	setSecurity,
	cloakAboutBlank,
	cloakBlob,
	cloakWindowed,
} from "./security.js";

const SECTIONS = [
	{ id: "appearance", label: "Appearance", icon: "palette" },
	{ id: "browser", label: "Browser", icon: "globe" },
	{ id: "security", label: "Security", icon: "shield" },
	{ id: "history", label: "History", icon: "clock" },
	{ id: "data", label: "Data", icon: "database" },
];

const CLEARABLE = {
	movies: ["riseub-movies-saved"],
	music: ["riseub-music", "riseub-music-liked", "riseub-music-volume"],
	prefs: ["riseub-prefs"],
};

function esc(s) {
	const d = document.createElement("div");
	d.textContent = s == null ? "" : s;
	return d.innerHTML;
}

export function initSettings(root) {
	let section = "appearance";

	const el = document.createElement("div");
	el.className = "settings";
	root.appendChild(el);

	/** `scope` keeps security switches out of the theme-prefs handler. */
	function switchHtml(key, on, scope = "pref") {
		return `<button type="button" class="switch${on ? " on" : ""}" data-toggle="${key}" data-scope="${scope}" role="switch" aria-checked="${on}" aria-label="Toggle"></button>`;
	}

	function themeGrid(prefs) {
		return `<div class="theme-grid">${THEMES.map(
			(t) => `
			<button type="button" class="theme-card${prefs.theme === t.id ? " on" : ""}" data-theme-pick="${t.id}">
				<span class="theme-card__check">${icon("check")}</span>
				<span class="theme-card__dots">${t.swatches
					.map(
						(c) =>
							`<span class="theme-card__dot" style="background:${esc(c)}"></span>`
					)
					.join("")}</span>
				<span class="theme-card__text">
					<strong>${esc(t.label)}</strong>
					<span class="theme-card__desc">${esc(t.desc)}</span>
				</span>
			</button>`
		).join("")}</div>`;
	}

	const PRESETS = [
		"#9aa3ab",
		"#7ff0c4",
		"#5b9dff",
		"#a78bfa",
		"#ff7a3d",
		"#fb7185",
		"#e0c097",
	];

	function monoPicker(prefs) {
		const hex = prefs.monoAccent || "#9aa3ab";
		return `
			<div class="accent-pick">
				<label class="accent-pick__swatch" style="background:${esc(hex)}">
					<input type="color" value="${esc(hex)}" data-accent aria-label="Accent colour" />
				</label>
				<div class="accent-pick__meta">
					<strong>Accent colour</strong>
					<span>${esc(hex.toUpperCase())}</span>
				</div>
				<div class="accent-pick__presets">
					${PRESETS.map(
						(c) =>
							`<button type="button" class="accent-pick__preset" style="background:${c}" data-preset="${c}" aria-label="Use ${c}"></button>`
					).join("")}
				</div>
			</div>`;
	}

	function paneAppearance(prefs) {
		return `
			<div class="settings__pane">
				<section class="card-block">
					<div class="card-block__head">
						<div>
							<h3>${icon("palette")}Color Theme</h3>
							<p>Sets the accent everywhere. Mono lets you pick your own colour.</p>
						</div>
					</div>
					<div class="card-block__body">${themeGrid(prefs)}</div>
					${prefs.theme === "mono" ? monoPicker(prefs) : ""}
				</section>

				<section class="card-block">
					<div class="card-block__head">
						<div>
							<h3>${icon("layers")}Taskbar Style</h3>
							<p>${esc(TASKBARS.find((t) => t.id === prefs.taskbar)?.blurb || "")}</p>
						</div>
						<span data-taskbar-slot></span>
					</div>
				</section>

				<section class="card-block">
					<div class="card-block__head">
						<div>
							<h3>${icon("panelLeft")}Vertical Tabs</h3>
							<p>Tabs go down the left side instead of across the top.</p>
						</div>
						${switchHtml("verticalTabs", prefs.verticalTabs)}
					</div>
				</section>

				<section class="card-block">
					<div class="card-block__head">
						<div>
							<h3>${icon("zap")}Reduce Motion</h3>
							<p>Kills the animations. Handy on a slow machine.</p>
						</div>
						${switchHtml("reduceMotion", prefs.reduceMotion)}
					</div>
				</section>

				<section class="card-block">
					<div class="card-block__head">
						<div>
							<h3>${icon("music")}Pop-out Player</h3>
							<p>The little always-on-top window. Bar is a slim strip, card looks like the now-playing panel.</p>
						</div>
						<span data-popout-slot></span>
					</div>
				</section>

				<section class="card-block">
					<div class="card-block__head">
						<div>
							<h3>${icon("sparkles")}Hide Badges</h3>
							<p>Drops the role and level chips from your taskbar card.</p>
						</div>
						${switchHtml("hideBadges", prefs.hideBadges)}
					</div>
				</section>

				<section class="card-block">
					<div class="card-block__head">
						<div>
							<h3>${icon("layers")}Blur Effects</h3>
							<p>Frosted panels look nice but cost frames. Off makes them solid.</p>
						</div>
						${switchHtml("blur", prefs.blur)}
					</div>
				</section>
			</div>`;
	}

	function sliderHtml(key, label, value, min, max, step, unit) {
		return `
			<label class="slider-row">
				<span class="slider-row__label">${esc(label)}</span>
				<input type="range" class="slider" min="${min}" max="${max}" step="${step}"
					value="${value}" data-slider="${key}" />
				<output class="slider-row__value">${value}${unit}</output>
			</label>`;
	}

	function paneBrowser() {
		return `
			<div class="settings__pane">
				<section class="card-block">
					<div class="card-block__head">
						<div>
							<h3>${icon("search")}Search</h3>
							<p>Anything that is not a URL goes here. Suggestions show under both search bars.</p>
						</div>
						<span data-engine-slot></span>
					</div>
				</section>
			</div>`;
	}

	function paneSecurity() {
		const sec = getSecurity();
		return `
			<div class="settings__pane">
				<section class="card-block">
					<div class="card-block__head">
						<div>
							<h3>${icon("shield")}Website Cloak</h3>
							<p>Reopen Rise inside a blank container so the address and history stay plain.</p>
						</div>
					</div>
					<div class="card-block__body">
						<div class="btn-row">
							<button type="button" class="btn-line" data-cloak="about">${icon("square")}About:Blank</button>
							<button type="button" class="btn-line" data-cloak="blob">${icon("database")}Blob</button>
							<button type="button" class="btn-line" data-cloak="window">${icon("monitor")}Windowed</button>
						</div>
						<p class="settings__note">Each opens a new window and closes this one. Allow popups first.</p>
					</div>
				</section>

				<section class="card-block">
					<div class="card-block__head">
						<div>
							<h3>${icon("image")}Website Mask</h3>
							<p>Borrows another site's tab icon and title. Saved across tabs and reloads.</p>
						</div>
						<span data-mask-slot></span>
					</div>
				</section>

				<section class="card-block">
					<div class="card-block__head">
						<div>
							<h3>${icon("layers")}Click Off Mask</h3>
							<p>Blurs everything the moment you switch away, and clears when you come back.</p>
						</div>
						${switchHtml("clickOff", sec.clickOff, "sec")}
					</div>
				</section>

				<section class="card-block">
					<div class="card-block__head">
						<div>
							<h3>${icon("shield")}Anti Close</h3>
							<p>Asks you to confirm before the tab closes, so nothing goes by accident.</p>
						</div>
						${switchHtml("antiClose", sec.antiClose, "sec")}
					</div>
				</section>
			</div>`;
	}

	function paneData() {
		return `
			<div class="settings__pane">
				<section class="card-block">
					<div class="card-block__head">
						<div>
							<h3>${icon("database")}Stored Data</h3>
							<p>It all sits in this browser. Nothing gets uploaded.</p>
						</div>
					</div>
					<div class="card-block__body">
						<div class="btn-row">
							<button type="button" class="btn-line" data-clear="movies">${icon("film")}Clear movie library</button>
							<button type="button" class="btn-line" data-clear="music">${icon("music")}Clear music library</button>
						</div>
						<p class="settings__note">Your saved titles, playlists and likes.</p>
					</div>
				</section>

				<section class="card-block">
					<div class="card-block__head">
						<div>
							<h3>${icon("download")}Backup</h3>
							<p>Export an encrypted .save with your profile, settings, and access token.</p>
						</div>
					</div>
					<div class="card-block__body">
						<div class="btn-row">
							<button type="button" class="btn-line" data-export>${icon("download")}Export data</button>
						</div>
					</div>
				</section>

				<section class="card-block">
					<div class="card-block__head">
						<div>
							<h3>${icon("trash")}Reset Preferences</h3>
							<p>Back to defaults. Your libraries stay put.</p>
						</div>
					</div>
					<div class="card-block__body">
						<div class="btn-row">
							<button type="button" class="btn-line btn-line--danger" data-clear="prefs">${icon("rotate")}Reset all settings</button>
						</div>
					</div>
				</section>
			</div>`;
	}

	/** The shell is built once - only the pane swaps, so nothing flashes. */
	function renderShell() {
		el.innerHTML = `
			<div class="settings__head">
				<h1 class="settings__title">settings</h1>
				<p class="settings__sub">Tune the look and behaviour of RiseUB.</p>
			</div>
			<div class="settings__inner">
				<nav class="settings__nav">
					${SECTIONS.map(
						(s) =>
							`<button type="button" class="settings__navbtn${section === s.id ? " on" : ""}" data-section="${s.id}">${icon(s.icon)}${esc(s.label)}</button>`
					).join("")}
				</nav>
				<div class="settings__body" data-body></div>
			</div>`;

		el.querySelectorAll("[data-section]").forEach((btn) => {
			btn.addEventListener("click", () => {
				if (section === btn.dataset.section) return;
				section = btn.dataset.section;
				el.querySelectorAll("[data-section]").forEach((b) =>
					b.classList.toggle("on", b.dataset.section === section)
				);
				renderPane();
			});
		});
	}

	function paneHtml() {
		const prefs = getPrefs();
		if (section === "appearance") return paneAppearance(prefs);
		if (section === "browser") return paneBrowser();
		if (section === "security") return paneSecurity();
		if (section === "history") return paneHistory();
		return paneData();
	}

	function renderPane({ animate = true } = {}) {
		const body = el.querySelector("[data-body]");
		if (!body) return;

		const paint = () => {
			body.innerHTML = paneHtml();
			bindPane();
		};

		if (!animate) {
			paint();
			return;
		}

		body.classList.add("is-leaving");
		setTimeout(() => {
			paint();
			body.classList.remove("is-leaving");
			body.classList.add("is-entering");
			setTimeout(() => body.classList.remove("is-entering"), 260);
		}, 110);
	}

	function bindPane() {
		el.querySelectorAll("[data-theme-pick]").forEach((btn) => {
			btn.addEventListener("click", () => {
				setPref("theme", btn.dataset.themePick);
				el.querySelectorAll("[data-theme-pick]").forEach((b) =>
					b.classList.toggle("on", b.dataset.themePick === btn.dataset.themePick)
				);
				// Mono brings a colour picker with it, so repaint when that changes.
				const wantsPicker = btn.dataset.themePick === "mono";
				if (wantsPicker !== !!el.querySelector(".accent-pick")) {
					renderPane({ animate: false });
				}
			});
		});

		const taskbarSlot = el.querySelector("[data-taskbar-slot]");
		if (taskbarSlot) {
			const picker = dropdown({
				items: TASKBARS.map((t) => ({ id: t.id, label: t.label, blurb: t.blurb })),
				value: getPrefs().taskbar,
				align: "right",
				className: "dd--settings",
				onPick: (id, item) => {
					setPref("taskbar", id);
					taskbarSlot.closest(".card-block__head").querySelector("p").textContent =
						item.blurb;
				},
			});
			taskbarSlot.replaceChildren(picker.el);
		}

		const popoutSlot = el.querySelector("[data-popout-slot]");
		if (popoutSlot) {
			const picker = dropdown({
				items: [
					{ id: "bar", label: "Bar", blurb: "Slim strip with the art on the left" },
					{ id: "card", label: "Card", blurb: "Big artwork, like the sidebar" },
				],
				value: getPrefs().popoutStyle,
				align: "right",
				onPick: (id) => setPref("popoutStyle", id),
			});
			popoutSlot.replaceChildren(picker.el);
		}

		const engineSlot = el.querySelector("[data-engine-slot]");
		if (engineSlot) {
			const picker = dropdown({
				items: SEARCH_ENGINES.map((e) => ({
					id: e.id,
					label: e.label,
					blurb: e.host,
				})),
				value: getPrefs().searchEngine,
				align: "right",
				onPick: (id) => setPref("searchEngine", id),
			});
			engineSlot.replaceChildren(picker.el);
		}

		el.querySelectorAll("[data-slider]").forEach((slider) => {
			const output = slider.parentElement.querySelector("output");
			const unit = output.textContent.replace(/[\d.]/g, "");
			slider.addEventListener("input", () => {
				output.textContent = `${slider.value}${unit}`;
				setPref(slider.dataset.slider, Number(slider.value));
			});
		});

		const accentInput = el.querySelector("[data-accent]");
		if (accentInput) {
			const applyAccent = (hex) => {
				setPref("monoAccent", hex);
				const row = accentInput.closest(".accent-pick");
				row.querySelector(".accent-pick__meta span").textContent = hex.toUpperCase();
				row.querySelector(".accent-pick__swatch").style.background = hex;
			};
			accentInput.addEventListener("input", (e) => applyAccent(e.target.value));
			el.querySelectorAll("[data-preset]").forEach((btn) => {
				btn.addEventListener("click", () => {
					accentInput.value = btn.dataset.preset;
					applyAccent(btn.dataset.preset);
				});
			});
		}

		el.querySelectorAll("[data-toggle]").forEach((btn) => {
			btn.addEventListener("click", () => {
				const key = btn.dataset.toggle;
				const security = btn.dataset.scope === "sec";
				const next = security ? !getSecurity()[key] : !getPrefs()[key];
				if (security) setSecurity({ [key]: next });
				else setPref(key, next);
				btn.classList.toggle("on", next);
				btn.setAttribute("aria-checked", String(next));
			});
		});

		el.querySelectorAll("[data-cloak]").forEach((btn) => {
			btn.addEventListener("click", () => {
				const kind = btn.dataset.cloak;
				if (kind === "about") cloakAboutBlank();
				else if (kind === "blob") cloakBlob();
				else cloakWindowed();
			});
		});

		const maskSlot = el.querySelector("[data-mask-slot]");
		if (maskSlot) {
			const picker = dropdown({
				items: MASKS.map((m) => ({
					id: m.id,
					label: m.label,
					blurb: m.id === "canvas" ? "Tab reads Dashboard" : m.title,
					image: m.icon || undefined,
				})),
				value: getSecurity().mask,
				align: "right",
				onPick: (id) => setSecurity({ mask: id }),
			});
			maskSlot.replaceChildren(picker.el);
		}

		el.querySelectorAll("[data-clear]").forEach((btn) => {
			btn.addEventListener("click", async () => {
				const kind = btn.dataset.clear;
				const ok = await confirmModal({
					title: "Clear this data?",
					subtitle: "Gone from this browser for good.",
					confirmText: "Clear",
					danger: true,
				});
				if (!ok) return;

				(CLEARABLE[kind] || []).forEach((k) => {
					try {
						localStorage.removeItem(k);
					} catch {}
				});
				if (kind === "prefs") {
					location.reload();
					return;
				}
				notify("Cleared", "That data is gone from this browser", "success");
			});
		});

		el.querySelector("[data-export]")?.addEventListener("click", async () => {
			try {
				let access = await readAccessToken();
				if (!access?.token) {
					const token = await promptModal({
						title: "Access token",
						subtitle: "Paste the invite token for this profile so the backup can restore it later.",
						placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
						confirmText: "Save & export",
					});
					if (!token?.trim()) {
						notify("Export cancelled", "A token is needed to restore this backup", "error");
						return;
					}
					const res = await fetch("/api/auth/verify", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ token: token.trim() }),
					});
					const data = await res.json().catch(() => ({}));
					if (!res.ok || !data.ok) {
						throw new Error(data.error || "That token isn't valid.");
					}
					const role = data.role || getProfile()?.role || "standard";
					await storeAccessToken(token.trim(), role);
				}
				const n = await exportVault();
				notify("Exported", `${n} keys saved to riseub-backup.save`, "success");
			} catch (err) {
				notify("Export failed", err.message || "Could not write backup", "error");
			}
		});

		bindHistory();
	}

	/* ── History ────────────────────────────────────────────────── */

	function paneHistory() {
		const list = getHistory();
		return `
			<div class="settings__pane">
				<section class="card-block">
					<div class="card-block__head">
						<div>
							<h3>${icon("clock")}Browsing History</h3>
							<p>Pages you have opened, newest first. Local only.</p>
						</div>
						${
							list.length
								? `<button type="button" class="btn-line btn-line--danger" data-history-clear>${icon("trash")}Clear all</button>`
								: ""
						}
					</div>
					<div class="card-block__body">
						${
							list.length
								? `<input type="search" class="field-input" placeholder="Filter history…" data-history-filter />
									<div class="history-list" data-history-list>${historyRows(list)}</div>`
								: `<p class="settings__note">Nothing yet. Browse a bit and it fills up.</p>`
						}
					</div>
				</section>
			</div>`;
	}

	function historyRows(list) {
		if (!list.length) {
			return `<p class="settings__note">No matches.</p>`;
		}
		return list
			.map((entry) => {
				let host = entry.url;
				try {
					host = new URL(entry.url).hostname.replace(/^www\./, "");
				} catch {}
				const when = new Date(entry.at).toLocaleString("en-US", {
					month: "short",
					day: "numeric",
					hour: "numeric",
					minute: "2-digit",
				});
				return `
				<div class="history-row" data-visit="${entry.at}">
					<span class="history-row__fav">${esc(host.slice(0, 2).toUpperCase())}${
						entry.favicon
							? `<img src="${esc(entry.favicon)}" alt="" onerror="this.remove()" />`
							: ""
					}</span>
					<button type="button" class="history-row__open" data-open="${esc(entry.url)}">
						<strong>${esc(entry.title || host)}</strong>
						<span>${esc(entry.url)}</span>
					</button>
					<span class="history-row__time">${esc(when)}</span>
					<button type="button" class="icon-btn" data-forget="${entry.at}" title="Remove">${icon("x")}</button>
				</div>`;
			})
			.join("");
	}

	function bindHistory() {
		const listEl = el.querySelector("[data-history-list]");

		el.querySelector("[data-history-clear]")?.addEventListener("click", async () => {
			const ok = await confirmModal({
				title: "Clear browsing history?",
				subtitle: "Wipes every entry on this device.",
				confirmText: "Clear history",
				danger: true,
			});
			if (!ok) return;
			clearHistory();
			renderPane({ animate: false });
			notify("History cleared", "", "success");
		});

		el.querySelector("[data-history-filter]")?.addEventListener("input", (e) => {
			const q = e.target.value.trim().toLowerCase();
			const rows = getHistory().filter(
				(entry) =>
					!q ||
					entry.url.toLowerCase().includes(q) ||
					(entry.title || "").toLowerCase().includes(q)
			);
			if (listEl) {
				listEl.innerHTML = historyRows(rows);
				wireHistoryRows();
			}
		});

		wireHistoryRows();
	}

	function wireHistoryRows() {
		el.querySelectorAll("[data-open]").forEach((btn) => {
			btn.addEventListener("click", () => {
				window.dispatchEvent(
					new CustomEvent("riseub:open-url", { detail: btn.dataset.open })
				);
			});
		});
		el.querySelectorAll("[data-forget]").forEach((btn) => {
			btn.addEventListener("click", () => {
				removeVisit(Number(btn.dataset.forget));
				btn.closest(".history-row")?.remove();
			});
		});
	}

	renderShell();
	renderPane({ animate: false });

	return {
		refresh: () => renderPane({ animate: false }),
		destroy() {
			el.remove();
		},
	};
}
