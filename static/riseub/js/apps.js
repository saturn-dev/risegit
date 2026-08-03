import { icon } from "./icons.js";
import { promptModal, contextMenu, confirmModal } from "./modal.js";
import { notify } from "./toast.js";

const KEY = "riseub-quick-apps";

/**
 * Built in rather than saved: it always leads the launcher, and right-click
 * offers no Delete because there's nothing stored to remove.
 */
const PINNED = {
	id: "autoclicker",
	name: "Auto clicker",
	icon: "cursorClick",
	pinned: true,
};

const DEFAULTS = [
	{ id: "yt", name: "YouTube", url: "https://www.youtube.com" },
	{ id: "gg", name: "Google", url: "https://www.google.com" },
	{ id: "dc", name: "Discord", url: "https://discord.com/app" },
	{ id: "rd", name: "Reddit", url: "https://www.reddit.com" },
	{ id: "tw", name: "Twitch", url: "https://www.twitch.tv" },
	{ id: "tk", name: "TikTok", url: "https://www.tiktok.com" },
	{ id: "ig", name: "Instagram", url: "https://www.instagram.com" },
	{ id: "sp", name: "Spotify", url: "https://open.spotify.com" },
	{ id: "gh", name: "GitHub", url: "https://github.com" },
	{ id: "nf", name: "Netflix", url: "https://www.netflix.com" },
];

function load() {
	try {
		const raw = localStorage.getItem(KEY);
		if (raw) {
			const list = JSON.parse(raw);
			if (Array.isArray(list) && list.length) return list;
		}
	} catch {}
	return DEFAULTS.slice();
}

function save(list) {
	try {
		localStorage.setItem(KEY, JSON.stringify(list));
	} catch {}
}

function esc(s) {
	const d = document.createElement("div");
	d.textContent = s == null ? "" : s;
	return d.innerHTML;
}

function hostOf(url) {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

function normalise(input) {
	const raw = input.trim();
	if (!raw) return null;
	const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
	try {
		const u = new URL(withScheme);
		if (!u.hostname.includes(".")) return null;
		return u.href;
	} catch {
		return null;
	}
}

export function initApps(host, { onOpenUrl, onAutoClicker }) {
	let apps = load();
	let open = false;

	const button = document.createElement("button");
	button.type = "button";
	button.className = "systray__btn systray__apps";
	button.title = "Quick apps";
	button.setAttribute("aria-label", "Quick apps");
	button.innerHTML = `<svg class="lucide" viewBox="0 0 24 24" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>`;
	host.appendChild(button);

	const panel = document.createElement("div");
	panel.className = "apps-panel";
	panel.hidden = true;
	document.body.appendChild(panel);

	function tileHtml(app) {
		if (app.pinned) {
			return `
				<div class="app-tile app-tile--pinned" data-app="${esc(app.id)}" title="${esc(app.name)}">
					<span class="app-tile__icon app-tile__icon--glyph">${icon(app.icon)}</span>
					<span class="app-tile__name">${esc(app.name)}</span>
				</div>`;
		}
		const host = hostOf(app.url);
		return `
			<div class="app-tile" data-app="${esc(app.id)}" title="${esc(app.name)} - ${esc(host)}">
				<span class="app-tile__icon">
					<span class="app-tile__letter">${esc(app.name.slice(0, 1).toUpperCase())}</span>
					<img src="/api/img?url=${encodeURIComponent(`https://icons.duckduckgo.com/ip3/${host}.ico`)}" alt="" loading="lazy" onerror="this.remove()" />
				</span>
				<span class="app-tile__name">${esc(app.name)}</span>
			</div>`;
	}

	function render() {
		panel.innerHTML = `
			<div class="apps-panel__head">
				<p class="apps-panel__label">Quick apps</p>
				<span class="apps-panel__hint">Drag to rearrange · right-click to remove</span>
			</div>
			<div class="apps-grid" id="apps-grid">
				${[PINNED, ...apps].map(tileHtml).join("")}
			</div>
			<button type="button" class="apps-add" data-add>${icon("plus")}<span>Quick action</span></button>`;
		bind();
	}

	async function addApp() {
		const url = await promptModal({
			title: "New quick action",
			subtitle: "Paste a link and it lands in your launcher.",
			label: "URL",
			placeholder: "example.com",
			confirmText: "Add",
		});
		if (!url) return;

		const href = normalise(url);
		if (!href) {
			notify("That doesn't look like a URL", "Try something like youtube.com", "error");
			return;
		}

		const name =
			(await promptModal({
				title: "Name it",
				subtitle: "Shown under the icon.",
				label: "Name",
				placeholder: hostOf(href),
				value: hostOf(href).split(".")[0],
				confirmText: "Add",
			})) || hostOf(href);

		apps.push({ id: `q${Date.now().toString(36)}`, name, url: href });
		save(apps);
		render();
		notify("Quick action added", name, "success");
	}

	function bind() {
		panel.querySelector("[data-add]").addEventListener("click", addApp);

		const grid = panel.querySelector("#apps-grid");

		grid.addEventListener("click", (e) => {
			const tile = e.target.closest("[data-app]");
			if (!tile || dragging?.moved) return;
			if (tile.dataset.app === PINNED.id) {
				setOpen(false);
				onAutoClicker();
				return;
			}
			const app = apps.find((a) => a.id === tile.dataset.app);
			if (!app) return;
			setOpen(false);
			onOpenUrl(app.url);
		});

		grid.addEventListener("contextmenu", (e) => {
			const tile = e.target.closest("[data-app]");
			if (!tile || tile.dataset.app === PINNED.id) return;
			e.preventDefault();
			const app = apps.find((a) => a.id === tile.dataset.app);
			contextMenu(e.clientX, e.clientY, [
				{
					label: "Open",
					icon: "arrowRight",
					run: () => {
						setOpen(false);
						onOpenUrl(app.url);
					},
				},
				{
					label: "Rename",
					icon: "settings",
					run: async () => {
						const name = await promptModal({
							title: "Rename",
							label: "Name",
							value: app.name,
						});
						if (name) {
							app.name = name;
							save(apps);
							render();
						}
					},
				},
				{
					label: "Delete",
					icon: "trash",
					danger: true,
					run: async () => {
						const ok = await confirmModal({
							title: `Remove ${app.name}?`,
							subtitle: "It disappears from the launcher.",
							confirmText: "Remove",
							danger: true,
						});
						if (!ok) return;
						apps = apps.filter((a) => a.id !== app.id);
						save(apps);
						render();
					},
				},
			]);
		});

		grid.addEventListener("pointerdown", (e) => startDrag(e, grid));
	}

	/* ── Drag to rearrange ──────────────────────────────────────── */

	let dragging = null;

	function startDrag(e, grid) {
		const node = e.target.closest("[data-app]");
		// The pinned tile always leads and never moves.
		if (!node || e.button !== 0 || node.dataset.app === PINNED.id) return;

		const nodes = [...grid.querySelectorAll("[data-app]:not(.app-tile--pinned)")];
		const index = nodes.indexOf(node);
		const rects = nodes.map((n) => n.getBoundingClientRect());

		dragging = {
			node,
			nodes,
			rects,
			index,
			target: index,
			x: e.clientX,
			y: e.clientY,
			moved: false,
		};

		const onMove = (ev) => {
			if (!dragging) return;
			const dx = ev.clientX - dragging.x;
			const dy = ev.clientY - dragging.y;
			if (!dragging.moved && Math.hypot(dx, dy) < 6) return;
			if (!dragging.moved) {
				dragging.moved = true;
				dragging.node.classList.add("is-dragging");
			}
			dragging.node.style.transform = `translate(${dx}px, ${dy}px)`;

			// Drop target = whichever tile centre is closest to the pointer.
			let best = dragging.index;
			let bestDist = Infinity;
			dragging.rects.forEach((r, i) => {
				const d = Math.hypot(
					ev.clientX - (r.left + r.width / 2),
					ev.clientY - (r.top + r.height / 2)
				);
				if (d < bestDist) {
					bestDist = d;
					best = i;
				}
			});
			if (best !== dragging.target) {
				dragging.target = best;
				dragging.nodes.forEach((n, i) => {
					if (i === dragging.index) return;
					n.classList.toggle(
						"is-shifted",
						(best > dragging.index && i > dragging.index && i <= best) ||
							(best < dragging.index && i >= best && i < dragging.index)
					);
				});
			}
		};

		const onUp = () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			if (!dragging) return;
			const { index: from, target: to, moved } = dragging;
			dragging.node.style.transform = "";
			dragging.nodes.forEach((n) =>
				n.classList.remove("is-dragging", "is-shifted")
			);

			if (moved && from !== to) {
				const [item] = apps.splice(from, 1);
				apps.splice(to, 0, item);
				save(apps);
				render();
			}
			// Let the click handler see `moved` before clearing.
			setTimeout(() => {
				dragging = null;
			}, 0);
		};

		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
	}

	/* ── Open / close ───────────────────────────────────────────── */

	function setOpen(next) {
		open = next;
		button.classList.toggle("is-on", open);
		if (open) {
			render();
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
		if (e.target.closest(".modal-root, .ctx-menu")) return;
		setOpen(false);
	});

	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && open) setOpen(false);
	});

	return {
		close: () => setOpen(false),
		isOpen: () => open,
	};
}
