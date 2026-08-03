import { icon } from "./icons.js";

let openMenu = null;

function esc(s) {
	const d = document.createElement("div");
	d.textContent = s == null ? "" : s;
	return d.innerHTML;
}

/**
 * Custom select. Renders a trigger plus a floating panel - no native <select>
 * anywhere, so it can be themed and animated like the rest of the app.
 */
export function dropdown({
	items,
	value,
	onPick,
	label = "",
	align = "left",
	searchable = false,
	groupLabel = "",
	className = "",
	up = false,
}) {
	const root = document.createElement("div");
	root.className = `dd ${className}`;

	const trigger = document.createElement("button");
	trigger.type = "button";
	trigger.className = "dd__trigger";
	if (label) trigger.setAttribute("aria-label", label);
	root.appendChild(trigger);

	const panel = document.createElement("div");
	panel.className = `dd__panel${align === "right" ? " dd__panel--right" : ""}${up ? " dd__panel--up" : ""}`;
	panel.hidden = true;
	root.appendChild(panel);

	let current = value;
	let query = "";

	function currentItem() {
		return items.find((i) => i.id === current) || items[0];
	}

	/** An item can carry a lucide name or a real image (mask thumbnails). */
	function glyph(item) {
		if (item?.image) {
			return `<span class="dd__icon dd__icon--img"><img src="${esc(item.image)}" alt="" /></span>`;
		}
		return item?.icon ? `<span class="dd__icon">${icon(item.icon)}</span>` : "";
	}

	function paintTrigger() {
		const item = currentItem();
		trigger.innerHTML = `
			${glyph(item)}
			<span class="dd__value">${esc(item?.label || "")}</span>
			<span class="dd__caret">${icon("chevronRight")}</span>`;
	}

	function paintPanel() {
		const list = items.filter(
			(i) => !query || i.label.toLowerCase().includes(query.toLowerCase())
		);

		panel.innerHTML = `
			${
				searchable
					? `<div class="dd__search">${icon("search")}<input type="text" placeholder="Search…" data-dd-search value="${esc(query)}" /></div>`
					: ""
			}
			${groupLabel ? `<p class="dd__group">${esc(groupLabel)}</p>` : ""}
			<div class="dd__list">
				${
					list.length
						? list
								.map(
									(item) => `
					<button type="button" class="dd__item${item.id === current ? " is-on" : ""}" data-dd="${esc(item.id)}">
						${glyph(item)}
						<span class="dd__text">
							<strong>${esc(item.label)}</strong>
							${item.blurb ? `<span>${esc(item.blurb)}</span>` : ""}
						</span>
						${item.id === current ? `<span class="dd__check">${icon("check")}</span>` : ""}
					</button>`
								)
								.join("")
						: `<p class="dd__empty">Nothing matches</p>`
				}
			</div>`;

		panel.querySelectorAll("[data-dd]").forEach((btn) => {
			btn.addEventListener("click", () => {
				current = btn.dataset.dd;
				paintTrigger();
				close();
				onPick?.(current, currentItem());
			});
		});

		const search = panel.querySelector("[data-dd-search]");
		if (search) {
			search.addEventListener("input", () => {
				query = search.value;
				const pos = search.selectionStart;
				paintPanel();
				const next = panel.querySelector("[data-dd-search]");
				next.focus();
				next.setSelectionRange(pos, pos);
			});
		}
	}

	function open() {
		if (openMenu && openMenu !== close) openMenu();
		openMenu = close;
		query = "";
		paintPanel();
		panel.hidden = false;
		root.classList.add("is-open");
		setTimeout(() => {
			panel.classList.add("is-in");
			panel.querySelector("[data-dd-search]")?.focus();
		}, 10);
	}

	function close() {
		panel.classList.remove("is-in");
		root.classList.remove("is-open");
		if (openMenu === close) openMenu = null;
		setTimeout(() => {
			panel.hidden = true;
		}, 200);
	}

	trigger.addEventListener("click", (e) => {
		e.stopPropagation();
		if (panel.hidden) open();
		else close();
	});

	document.addEventListener("pointerdown", (e) => {
		if (panel.hidden || root.contains(e.target)) return;
		close();
	});

	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && !panel.hidden) close();
	});

	paintTrigger();

	return {
		el: root,
		get value() {
			return current;
		},
		set(next) {
			current = next;
			paintTrigger();
		},
		setItems(next) {
			items = next;
			paintTrigger();
		},
		close,
	};
}

/** Drop-up menu of actions - used by the AI composer's plus button. */
export function actionMenu({ sections, onPick, className = "" }) {
	const panel = document.createElement("div");
	panel.className = `dd__panel dd__panel--up action-menu ${className}`;
	panel.hidden = true;

	panel.innerHTML = sections
		.map(
			(section) => `
		<p class="dd__group">${esc(section.label)}</p>
		<div class="dd__list">
			${section.items
				.map(
					(item) => `
				<button type="button" class="dd__item" data-action="${esc(item.id)}">
					<span class="dd__icon dd__icon--tile">${icon(item.icon)}</span>
					<span class="dd__text">
						<strong>${esc(item.label)}</strong>
						${item.blurb ? `<span>${esc(item.blurb)}</span>` : ""}
					</span>
					${item.toggle ? `<span class="dd__switch" data-state="off"></span>` : ""}
				</button>`
				)
				.join("")}
		</div>`
		)
		.join("");

	panel.querySelectorAll("[data-action]").forEach((btn) => {
		btn.addEventListener("click", () => onPick?.(btn.dataset.action, btn));
	});

	return {
		el: panel,
		open() {
			panel.hidden = false;
			setTimeout(() => panel.classList.add("is-in"), 10);
		},
		close() {
			panel.classList.remove("is-in");
			setTimeout(() => {
				panel.hidden = true;
			}, 200);
		},
		get isOpen() {
			return !panel.hidden;
		},
		setToggle(id, on) {
			const btn = panel.querySelector(`[data-action="${id}"]`);
			btn?.classList.toggle("is-on", on);
			btn?.querySelector(".dd__switch")?.setAttribute("data-state", on ? "on" : "off");
		},
	};
}
