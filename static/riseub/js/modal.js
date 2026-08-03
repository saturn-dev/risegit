import { icon } from "./icons.js";

let openCount = 0;

/**
 * Centred dialog with a blurred backdrop. Returns handles so callers can wire
 * their own buttons; closes on backdrop click and Escape.
 */
export function openModal({ title, subtitle = "", body = "", size = "", onClose } = {}) {
	const root = document.createElement("div");
	root.className = "modal-root";
	root.innerHTML = `
		<div class="modal-backdrop"></div>
		<div class="modal${size ? ` modal--${size}` : ""}" role="dialog" aria-modal="true">
			<header class="modal__head">
				<div>
					<h2 class="modal__title">${title || ""}</h2>
					${subtitle ? `<p class="modal__sub">${subtitle}</p>` : ""}
				</div>
				<button type="button" class="modal__x" aria-label="Close">${icon("x")}</button>
			</header>
			<div class="modal__body"></div>
		</div>`;

	const bodyEl = root.querySelector(".modal__body");
	if (typeof body === "string") bodyEl.innerHTML = body;
	else if (body) bodyEl.appendChild(body);

	document.body.appendChild(root);
	openCount += 1;
	document.body.classList.add("has-modal");

	setTimeout(() => root.classList.add("is-open"), 16);

	let closed = false;
	function close() {
		if (closed) return;
		closed = true;
		openCount = Math.max(0, openCount - 1);
		if (!openCount) document.body.classList.remove("has-modal");
		root.classList.remove("is-open");
		root.classList.add("is-closing");
		setTimeout(() => root.remove(), 260);
		document.removeEventListener("keydown", onKey);
		onClose?.();
	}

	function onKey(e) {
		if (e.key === "Escape") {
			e.stopPropagation();
			close();
		}
	}

	root.querySelector(".modal__x").addEventListener("click", close);
	root.querySelector(".modal-backdrop").addEventListener("click", close);
	document.addEventListener("keydown", onKey);

	setTimeout(() => {
		root.querySelector("input, button:not(.modal__x)")?.focus?.();
	}, 60);

	return { root, body: bodyEl, close };
}

/** Small confirm/prompt helpers so nothing falls back to window.prompt. */
export function promptModal({
	title,
	subtitle = "",
	label = "",
	placeholder = "",
	value = "",
	confirmText = "Save",
}) {
	return new Promise((resolve) => {
		let settled = false;
		const m = openModal({
			title,
			subtitle,
			size: "sm",
			body: `
				<form class="form-stack">
					${label ? `<label class="field-label">${label}</label>` : ""}
					<input type="text" class="field-input" placeholder="${placeholder}" value="${value}" />
					<div class="form-actions">
						<button type="button" class="btn-line" data-cancel>Cancel</button>
						<button type="submit" class="btn-line btn-line--accent">${confirmText}</button>
					</div>
				</form>`,
			onClose: () => {
				if (!settled) resolve(null);
			},
		});

		const input = m.body.querySelector("input");
		m.body.querySelector("[data-cancel]").addEventListener("click", () => m.close());
		m.body.querySelector("form").addEventListener("submit", (e) => {
			e.preventDefault();
			settled = true;
			resolve(input.value.trim());
			m.close();
		});
		setTimeout(() => input.focus(), 80);
	});
}

export function confirmModal({ title, subtitle = "", confirmText = "Confirm", danger = false }) {
	return new Promise((resolve) => {
		let settled = false;
		const m = openModal({
			title,
			subtitle,
			size: "sm",
			body: `
				<div class="form-actions">
					<button type="button" class="btn-line" data-cancel>Cancel</button>
					<button type="button" class="btn-line ${danger ? "btn-line--danger" : "btn-line--accent"}" data-ok>${confirmText}</button>
				</div>`,
			onClose: () => {
				if (!settled) resolve(false);
			},
		});
		m.body.querySelector("[data-cancel]").addEventListener("click", () => m.close());
		m.body.querySelector("[data-ok]").addEventListener("click", () => {
			settled = true;
			resolve(true);
			m.close();
		});
	});
}

/** Right-click menu used by the app launcher. */
export function contextMenu(x, y, items) {
	document.querySelector(".ctx-menu")?.remove();

	const menu = document.createElement("div");
	menu.className = "ctx-menu";
	menu.innerHTML = items
		.map(
			(item, i) =>
				`<button type="button" class="ctx-menu__item${item.danger ? " is-danger" : ""}" data-i="${i}">${item.icon ? icon(item.icon) : ""}${item.label}</button>`
		)
		.join("");
	document.body.appendChild(menu);

	const rect = menu.getBoundingClientRect();
	menu.style.left = `${Math.min(x, innerWidth - rect.width - 10)}px`;
	menu.style.top = `${Math.min(y, innerHeight - rect.height - 10)}px`;
	setTimeout(() => menu.classList.add("is-open"), 16);

	const closeMenu = () => {
		menu.remove();
		document.removeEventListener("pointerdown", onAway, true);
	};
	const onAway = (e) => {
		if (!menu.contains(e.target)) closeMenu();
	};

	menu.querySelectorAll("[data-i]").forEach((btn) => {
		btn.addEventListener("click", () => {
			items[Number(btn.dataset.i)].run?.();
			closeMenu();
		});
	});

	setTimeout(() => document.addEventListener("pointerdown", onAway, true), 0);
	return closeMenu;
}
