import { icon } from "./icons.js";
import { getNotifications, onNotifications, clearNotifications } from "./toast.js";
import { initApps } from "./apps.js";
import { initAutoClicker } from "./autoclicker.js";
import { initMiniPlayer } from "./miniplayer.js";
import { contextMenu, promptModal, confirmModal } from "./modal.js";

const REMINDERS_KEY = "riseub-reminders";

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

function loadReminders() {
	try {
		const raw = localStorage.getItem(REMINDERS_KEY);
		if (raw) return JSON.parse(raw);
	} catch {}
	return {};
}

function saveReminders(map) {
	try {
		localStorage.setItem(REMINDERS_KEY, JSON.stringify(map));
	} catch {}
}

function dayKey(y, m, d) {
	return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function esc(s) {
	const d = document.createElement("div");
	d.textContent = s == null ? "" : s;
	return d.innerHTML;
}

function timeAgo(ts) {
	const secs = Math.round((Date.now() - ts) / 1000);
	if (secs < 60) return "just now";
	const mins = Math.round(secs / 60);
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.round(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	return `${Math.round(hrs / 24)}d ago`;
}

function batterySvg(level, charging) {
	// Shell inner fillable width is 15 (from x=3.5 to ~18.5).
	const width = Math.max(0.5, Math.round(15 * Math.min(1, Math.max(0, level))));
	return `
		<svg class="battery" viewBox="0 0 26 24" aria-hidden="true">
			<rect class="battery__shell" x="1.5" y="6.5" width="19" height="11" rx="3" />
			<path class="battery__cap" d="M22.5 10.5v3" />
			<rect class="battery__fill" x="3.5" y="8.5" width="${width}" height="7" rx="1.6" />
			${charging ? `<path class="battery__bolt" d="M12.4 7.6 8.6 13h2.6l-.8 3.6 3.9-5.6h-2.6z" />` : ""}
		</svg>`;
}

export function initTray({ onOpenUrl }) {
	const host = document.createElement("div");
	host.className = "systray";
	document.body.appendChild(host);

	// Left-to-right: now playing, auto clicker, app launcher, clock cluster.
	const mini = initMiniPlayer(host);
	const clicker = initAutoClicker(host);
	const apps = initApps(host, {
		onOpenUrl,
		onAutoClicker: () => clicker.toggle(),
	});

	const button = document.createElement("button");
	button.type = "button";
	button.className = "systray__btn systray__clock";
	button.setAttribute("aria-label", "Clock, battery and notifications");
	host.appendChild(button);

	const panel = document.createElement("div");
	panel.className = "tray-panel";
	panel.hidden = true;
	document.body.appendChild(panel);

	let battery = null;
	let reminders = loadReminders();
	let open = false;
	let calMonth = new Date().getMonth();
	let calYear = new Date().getFullYear();

	/* ── Clock button ───────────────────────────────────────────── */

	function renderButton() {
		const now = new Date();
		const time = now
			.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
			.replace(/ /g, " ");

		const level = battery ? battery.level : null;
		const pct = level == null ? null : Math.round(level * 100);

		button.innerHTML = `
			${
				pct == null
					? ""
					: `<span class="systray__battery" title="Battery ${pct}%${battery.charging ? " · charging" : ""}">
							${batterySvg(level, battery.charging)}
							<span class="systray__pct">${pct}%</span>
						</span>`
			}
			<span class="systray__divider" aria-hidden="true"></span>
			<span class="systray__time"><strong>${esc(time)}</strong></span>`;
	}

	/* ── Panel ──────────────────────────────────────────────────── */

	function calendarHtml() {
		const first = new Date(calYear, calMonth, 1);
		const startDay = first.getDay();
		const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
		const prevDays = new Date(calYear, calMonth, 0).getDate();
		const today = new Date();
		const isThisMonth =
			today.getMonth() === calMonth && today.getFullYear() === calYear;

		const cells = [];
		for (let i = startDay - 1; i >= 0; i--) {
			cells.push(`<span class="cal__cell is-muted">${prevDays - i}</span>`);
		}
		for (let d = 1; d <= daysInMonth; d++) {
			const on = isThisMonth && d === today.getDate();
			const key = dayKey(calYear, calMonth, d);
			const note = reminders[key];
			cells.push(
				`<span class="cal__cell${on ? " is-today" : ""}${note ? " has-note" : ""}" data-day="${d}"${
					note ? ` data-note="${esc(note)}"` : ""
				}>${d}${note ? `<span class="cal__bell">${icon("clock")}</span>` : ""}</span>`
			);
		}
		let next = 1;
		while (cells.length % 7 !== 0 || cells.length < 42) {
			cells.push(`<span class="cal__cell is-muted">${next++}</span>`);
			if (cells.length >= 42) break;
		}

		return `
			<div class="cal">
				<div class="cal__head">
					<strong>${MONTHS[calMonth]} ${calYear}</strong>
					<div class="cal__nav">
						<button type="button" data-cal="-1" aria-label="Previous month">${icon("chevronLeft")}</button>
						<button type="button" data-cal="1" aria-label="Next month">${icon("chevronRight")}</button>
					</div>
				</div>
				<div class="cal__grid cal__grid--days">
					${DAYS.map((d) => `<span class="cal__day">${d}</span>`).join("")}
				</div>
				<div class="cal__grid">${cells.join("")}</div>
			</div>`;
	}

	function renderPanel() {
		// Capped instead of scrollable - a nested scrollbar clipped the cards.
		const all = getNotifications();
		const list = all.slice(0, 4);
		const extra = all.length - list.length;
		const today = new Date();
		const heading = today.toLocaleDateString("en-US", {
			weekday: "long",
			month: "long",
			day: "numeric",
		});

		panel.innerHTML = `
			<section class="tray-card">
				<header class="tray-card__head">
					<h3>Notifications</h3>
					<button type="button" class="tray-icon-btn" data-clear title="Clear all" aria-label="Clear all">${icon("trash")}</button>
				</header>
				<div class="tray-notes">
					${
						list.length
							? list
									.map(
										(n) => `
						<article class="tray-note tray-note--${esc(n.kind)}">
							<span class="tray-note__icon">${icon(n.kind === "music" ? "music" : n.kind === "success" ? "check" : "info")}</span>
							<div>
								<strong>${esc(n.title)}</strong>
								${n.body ? `<p>${esc(n.body)}</p>` : ""}
								<span class="tray-note__time">${timeAgo(n.at)}</span>
							</div>
						</article>`
									)
									.join("")
							: `<p class="tray-empty">No new notifications</p>`
					}
					${extra > 0 ? `<p class="tray-more">+${extra} earlier</p>` : ""}
				</div>
			</section>

			<section class="tray-card">
				<header class="tray-card__head">
					<h3>${esc(heading)}</h3>
				</header>
				${calendarHtml()}
			</section>`;

		panel.querySelector("[data-clear]")?.addEventListener("click", () => {
			clearNotifications();
		});
		// Right-click a date to leave yourself a note on it.
		panel.querySelectorAll("[data-day]").forEach((cell) => {
			cell.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				const day = Number(cell.dataset.day);
				const key = dayKey(calYear, calMonth, day);
				const when = new Date(calYear, calMonth, day);
				const pretty = when.toLocaleDateString("en-US", {
					weekday: "long",
					month: "long",
					day: "numeric",
					year: "numeric",
				});
				const existing = reminders[key];

				const items = [
					{
						label: existing ? "Edit reminder" : "Add reminder",
						icon: "clock",
						run: async () => {
							const text = await promptModal({
								title: existing ? "Edit reminder" : "Add reminder",
								subtitle: pretty,
								label: "Reminder",
								placeholder: "History essay due",
								value: existing || "",
								confirmText: "Save",
							});
							if (!text) return;
							reminders[key] = text;
							saveReminders(reminders);
							renderPanel();
						},
					},
				];

				if (existing) {
					items.push({
						label: "Delete reminder",
						icon: "trash",
						danger: true,
						run: async () => {
							const ok = await confirmModal({
								title: "Delete this reminder?",
								subtitle: `${pretty} - “${existing}”`,
								confirmText: "Delete",
								danger: true,
							});
							if (!ok) return;
							delete reminders[key];
							saveReminders(reminders);
							renderPanel();
						},
					});
				}

				contextMenu(e.clientX, e.clientY, items);
			});
		});

		panel.querySelectorAll("[data-cal]").forEach((btn) => {
			btn.addEventListener("click", () => {
				calMonth += Number(btn.dataset.cal);
				if (calMonth < 0) {
					calMonth = 11;
					calYear -= 1;
				} else if (calMonth > 11) {
					calMonth = 0;
					calYear += 1;
				}
				renderPanel();
			});
		});
	}

	function setOpen(next) {
		open = next;
		button.classList.toggle("is-on", open);
		if (open) {
			apps.close();
			mini.close();
			renderPanel();
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
		setOpen(false);
	});

	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && open) setOpen(false);
	});

	onNotifications(() => {
		if (open) renderPanel();
		button.classList.add("has-pulse");
		setTimeout(() => button.classList.remove("has-pulse"), 900);
	});

	/* ── Battery ────────────────────────────────────────────────── */

	navigator.getBattery?.().then((b) => {
		battery = b;
		renderButton();
		["levelchange", "chargingchange"].forEach((ev) =>
			b.addEventListener(ev, renderButton)
		);
	});

	renderButton();
	setInterval(renderButton, 15000);

	return {
		closeAll() {
			setOpen(false);
			apps.close();
			mini.close();
		},
	};
}
