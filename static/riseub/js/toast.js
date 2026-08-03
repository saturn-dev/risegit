import { icon } from "./icons.js";

const MAX_VISIBLE = 3;
const HISTORY_MAX = 30;
/** Repeats of the same message inside this window collapse into one. */
const DEDUPE_MS = 6000;
/** Hard ceiling on how many can arrive in a burst before we mute. */
const BURST_LIMIT = 6;
const BURST_MS = 3000;

let recent = new Map();
let burst = [];

const KINDS = {
	info: { name: "info", life: 4500 },
	success: { name: "check", life: 4000 },
	error: { name: "info", life: 7000 },
	music: { name: "music", life: 4000 },
};

const notifications = [];
const listeners = new Set();
let host = null;

function ensureHost() {
	if (host) return host;
	host = document.createElement("div");
	host.className = "toast-host";
	host.id = "toast-host";
	document.body.appendChild(host);
	return host;
}

function emit() {
	listeners.forEach((fn) => fn(getNotifications()));
}

export function onNotifications(fn) {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

export function getNotifications() {
	return notifications.slice();
}

export function clearNotifications() {
	notifications.length = 0;
	emit();
}

function esc(s) {
	const d = document.createElement("div");
	d.textContent = s == null ? "" : s;
	return d.innerHTML;
}

/** Bottom-right stacking notification. Also lands in the tray's centre. */
export function notify(title, body = "", kind = "info") {
	const spec = KINDS[kind] || KINDS.info;
	const now = Date.now();
	const signature = `${kind}|${title}|${body}`;

	// Same message again while it's still on screen - bump the count instead
	// of stacking another card. A failing stream used to spam these forever.
	const seen = recent.get(signature);
	if (seen && now - seen.at < DEDUPE_MS) {
		seen.at = now;
		seen.count += 1;
		if (seen.el?.isConnected) {
			let badge = seen.el.querySelector(".toast__count");
			if (!badge) {
				badge = document.createElement("span");
				badge.className = "toast__count";
				seen.el.querySelector(".toast__text").appendChild(badge);
			}
			badge.textContent = `×${seen.count}`;
		}
		return seen.el;
	}

	// Something is misbehaving in a loop - stop feeding the DOM.
	burst = burst.filter((t) => now - t < BURST_MS);
	burst.push(now);
	if (burst.length > BURST_LIMIT) return null;

	if (recent.size > 40) recent.clear();

	notifications.unshift({
		id: `n${Date.now()}${Math.random().toString(16).slice(2, 6)}`,
		title,
		body,
		kind,
		at: Date.now(),
	});
	if (notifications.length > HISTORY_MAX) notifications.length = HISTORY_MAX;
	emit();

	const root = ensureHost();
	while (root.children.length >= MAX_VISIBLE) dismiss(root.firstElementChild);

	const el = document.createElement("article");
	el.className = `toast toast--${kind}`;
	el.innerHTML = `
		<span class="toast__icon">${icon(spec.name)}</span>
		<div class="toast__text">
			<strong>${esc(title)}</strong>
			${body ? `<p>${esc(body)}</p>` : ""}
		</div>
		<button type="button" class="toast__x" aria-label="Dismiss">${icon("x")}</button>
		<span class="toast__life" style="animation-duration:${spec.life}ms"></span>`;
	root.appendChild(el);
	recent.set(signature, { at: now, count: 1, el });

	setTimeout(() => el.classList.add("is-in"), 16);

	let timer = setTimeout(() => dismiss(el), spec.life);
	el.addEventListener("mouseenter", () => {
		clearTimeout(timer);
		el.classList.add("is-held");
	});
	el.addEventListener("mouseleave", () => {
		el.classList.remove("is-held");
		timer = setTimeout(() => dismiss(el), 1800);
	});
	el.querySelector(".toast__x").addEventListener("click", () => {
		clearTimeout(timer);
		dismiss(el);
	});

	return el;
}

function dismiss(el) {
	if (!el || el.dataset.going) return;
	el.dataset.going = "1";
	el.classList.add("is-out");
	el.addEventListener("transitionend", () => el.remove(), { once: true });
	setTimeout(() => el.remove(), 500);
}
