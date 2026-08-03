import { icon } from "./icons.js";
import { notify } from "./toast.js";

const KEY = "riseub-autoclicker";

const DEFAULTS = {
	hours: 0,
	mins: 0,
	secs: 0,
	ms: 100,
	button: "left",
	type: "single",
	hotkey: "q",
	// Where the window was left, so it comes back where you put it.
	left: null,
	top: null,
};

const BUTTONS = { left: 0, middle: 1, right: 2 };
const BUTTON_MASK = { left: 1, middle: 4, right: 2 };
/** Never let a bad interval spin the page to death. */
const MIN_INTERVAL = 10;

function load() {
	try {
		const raw = localStorage.getItem(KEY);
		if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
	} catch {}
	return { ...DEFAULTS };
}

function esc(s) {
	const d = document.createElement("div");
	d.textContent = s == null ? "" : s;
	return d.innerHTML;
}

/**
 * Walk down through same-origin frames to whatever is really under the point.
 * Games run from blob: and proxied pages are served from our own origin, so
 * this reaches inside them - which is what makes the clicks land.
 */
function targetAt(x, y) {
	let doc = document;
	let cx = x;
	let cy = y;

	for (let depth = 0; depth < 8; depth++) {
		let el = null;
		try {
			el = doc.elementFromPoint(cx, cy);
		} catch {}
		if (!el) return { el: doc.body || doc.documentElement, x: cx, y: cy };
		if (el.tagName !== "IFRAME" && el.tagName !== "FRAME") {
			return { el, x: cx, y: cy };
		}

		let inner = null;
		try {
			inner = el.contentDocument;
		} catch {}
		// Cross-origin: the frame itself is the best we can do.
		if (!inner) return { el, x: cx, y: cy };

		const rect = el.getBoundingClientRect();
		cx -= rect.left;
		cy -= rect.top;
		doc = inner;
	}
	return { el: doc.body || doc.documentElement, x: cx, y: cy };
}

export function initAutoClicker(host) {
	let cfg = load();
	let open = false;
	let running = false;
	let timer = null;
	let done = 0;
	let capturingHotkey = false;
	/** Last pointer position, tracked through same-origin frames too. */
	let pointer = { x: Math.round(innerWidth / 2), y: Math.round(innerHeight / 2) };

	function save() {
		try {
			localStorage.setItem(KEY, JSON.stringify(cfg));
		} catch {}
	}

	/* ── Tray button ────────────────────────────────────────────── */

	const button = document.createElement("button");
	button.type = "button";
	button.className = "systray__btn systray__clicker";
	button.title = "Auto clicker";
	button.setAttribute("aria-label", "Auto clicker");
	button.hidden = true;
	button.innerHTML = `${icon("cursorClick")}<span class="systray__pulse"></span>`;
	host.appendChild(button);

	/* ── Window ─────────────────────────────────────────────────── */

	const win = document.createElement("section");
	win.className = "ac";
	win.hidden = true;
	win.setAttribute("role", "dialog");
	win.setAttribute("aria-label", "Auto clicker");
	document.body.appendChild(win);

	function fieldRow() {
		return `
			<div class="ac__row">
				<label class="ac__num"><input type="number" min="0" max="99" data-f="hours" value="${cfg.hours}" /><span>hours</span></label>
				<label class="ac__num"><input type="number" min="0" max="59" data-f="mins" value="${cfg.mins}" /><span>mins</span></label>
				<label class="ac__num"><input type="number" min="0" max="59" data-f="secs" value="${cfg.secs}" /><span>secs</span></label>
				<label class="ac__num"><input type="number" min="0" max="999" data-f="ms" value="${cfg.ms}" /><span>ms</span></label>
			</div>`;
	}

	function render() {
		win.innerHTML = `
			<header class="ac__bar" data-drag>
				<span class="ac__title">${icon("cursorClick")}<strong>Auto clicker</strong></span>
				<span class="ac__state" data-state></span>
				<button type="button" class="ac__x" data-close aria-label="Close">${icon("close")}</button>
			</header>

			<div class="ac__body">
				<fieldset class="ac__set">
					<legend>Click interval</legend>
					${fieldRow()}
				</fieldset>

				<fieldset class="ac__set">
					<legend>Click options</legend>
						<label class="ac__field">
							<span>Mouse button</span>
							<select data-f="button">
								${["left", "middle", "right"]
									.map(
										(v) =>
											`<option value="${v}"${cfg.button === v ? " selected" : ""}>${v[0].toUpperCase() + v.slice(1)}</option>`
									)
									.join("")}
							</select>
						</label>
						<label class="ac__field">
							<span>Click type</span>
							<select data-f="type">
								${["single", "double"]
									.map(
										(v) =>
											`<option value="${v}"${cfg.type === v ? " selected" : ""}>${v[0].toUpperCase() + v.slice(1)}</option>`
									)
									.join("")}
							</select>
						</label>
					</fieldset>

				<p class="ac__note">${icon("cursorClick")}Clicks wherever your cursor is. This window is never a target.</p>

				<div class="ac__actions">
					<button type="button" class="ac__go" data-start>${icon("play", "lucide--fill")}Start <kbd>${esc(cfg.hotkey.toUpperCase())}</kbd></button>
					<button type="button" class="ac__stop" data-stop disabled>${icon("square", "lucide--fill")}Stop <kbd>${esc(cfg.hotkey.toUpperCase())}</kbd></button>
					<button type="button" class="ac__ghost" data-hotkey>${icon("settings")}Hotkey</button>
				</div>
			</div>`;
		bind();
		paint();
	}

	/* ── Clicking ───────────────────────────────────────────────── */

	function intervalMs() {
		const total =
			(Number(cfg.hours) || 0) * 3600000 +
			(Number(cfg.mins) || 0) * 60000 +
			(Number(cfg.secs) || 0) * 1000 +
			(Number(cfg.ms) || 0);
		return Math.max(MIN_INTERVAL, total);
	}

	function fire(el, type, x, y) {
		const view = el.ownerDocument?.defaultView || window;
		const init = {
			bubbles: true,
			cancelable: true,
			composed: true,
			view,
			clientX: x,
			clientY: y,
			screenX: x,
			screenY: y,
			button: BUTTONS[cfg.button] ?? 0,
			buttons: type.endsWith("down") ? BUTTON_MASK[cfg.button] || 1 : 0,
			detail: type === "dblclick" ? 2 : 1,
			pointerId: 1,
			pointerType: "mouse",
			isPrimary: true,
		};
		const Ctor =
			type.startsWith("pointer") && view.PointerEvent ? view.PointerEvent : view.MouseEvent;
		try {
			el.dispatchEvent(new Ctor(type, init));
		} catch {
			// Some frames tear down mid-run; a dropped click isn't fatal.
		}
	}

	/**
	 * True when the cursor is over our own window or tray button. Clicking
	 * those would have the run press its own Stop button - which is exactly
	 * why it used to halt the instant you started it.
	 */
	function overOwnUi(x, y) {
		for (const node of [win, button]) {
			if (!node || node.hidden) continue;
			const r = node.getBoundingClientRect();
			if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
		}
		return false;
	}

	function clickOnce() {
		if (overOwnUi(pointer.x, pointer.y)) return false;
		const { el, x, y } = targetAt(pointer.x, pointer.y);
		if (!el) return false;

		const press = () => {
			fire(el, "pointerdown", x, y);
			fire(el, "mousedown", x, y);
			fire(el, "pointerup", x, y);
			fire(el, "mouseup", x, y);
			fire(el, "click", x, y);
		};

		press();
		if (cfg.type === "double") {
			press();
			fire(el, "dblclick", x, y);
		}
		if (cfg.button === "right") fire(el, "contextmenu", x, y);
		return true;
	}

	function tick() {
		// A skipped click (cursor parked on our own window) doesn't burn a
		// repeat - move the mouse onto the page and it picks up where it was.
		if (clickOnce()) {
			done++;
			paintState();
		} else {
			paintState();
		}
		timer = setTimeout(tick, intervalMs());
	}

	function start() {
		if (running) return;
		running = true;
		done = 0;
		paint();
		// First click on the next frame so the Start button's own click settles.
		timer = setTimeout(tick, 60);
	}

	function stop() {
		if (!running) return;
		running = false;
		clearTimeout(timer);
		timer = null;
		paint();
	}

	/* ── Painting ───────────────────────────────────────────────── */

	function paintState() {
		const state = win.querySelector("[data-state]");
		if (!state) return;
		state.textContent = running
			? `${done} clicks`
			: "";
	}

	function paint() {
		win.classList.toggle("is-running", running);
		button.classList.toggle("is-running", running);
		const startBtn = win.querySelector("[data-start]");
		const stopBtn = win.querySelector("[data-stop]");
		if (startBtn) startBtn.disabled = running;
		if (stopBtn) stopBtn.disabled = !running;
		paintState();
	}

	/* ── Wiring ─────────────────────────────────────────────────── */

	function bind() {
		win.querySelectorAll("[data-f]").forEach((input) => {
			input.addEventListener("change", () => {
				const key = input.dataset.f;
				if (input.type === "radio") {
					if (!input.checked) return;
					cfg[key] = input.value;
				} else if (input.type === "number") {
					cfg[key] = Number(input.value) || 0;
				} else {
					cfg[key] = input.value;
				}
				save();
			});
		});

		win.querySelector("[data-close]").addEventListener("click", () => {
			stop();
			setOpen(false);
			// The × dismisses it everywhere, tray icon included.
			button.hidden = true;
		});
		win.querySelector("[data-start]").addEventListener("click", start);
		win.querySelector("[data-stop]").addEventListener("click", stop);
		win.querySelector("[data-hotkey]").addEventListener("click", beginHotkey);

		win.querySelector("[data-drag]").addEventListener("pointerdown", startDrag);
	}

	function beginHotkey() {
		capturingHotkey = true;
		const btn = win.querySelector("[data-hotkey]");
		btn.classList.add("is-arming");
		btn.textContent = "Press a key…";
	}

	/* ── Dragging ───────────────────────────────────────────────── */

	function startDrag(e) {
		if (e.target.closest("button")) return;
		e.preventDefault();
		const rect = win.getBoundingClientRect();
		const dx = e.clientX - rect.left;
		const dy = e.clientY - rect.top;
		win.setPointerCapture?.(e.pointerId);
		win.classList.add("is-dragging");

		const move = (ev) => {
			const left = Math.max(8, Math.min(innerWidth - rect.width - 8, ev.clientX - dx));
			const top = Math.max(8, Math.min(innerHeight - rect.height - 8, ev.clientY - dy));
			win.style.left = `${left}px`;
			win.style.top = `${top}px`;
			win.style.right = "auto";
			win.style.bottom = "auto";
			cfg.left = left;
			cfg.top = top;
		};
		const up = () => {
			win.classList.remove("is-dragging");
			save();
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	}

	/* ── Pointer tracking ───────────────────────────────────────── */

	const trackParent = (e) => {
		pointer = { x: e.clientX, y: e.clientY };
	};
	window.addEventListener("pointermove", trackParent, true);

	/**
	 * The parent sees no moves while the pointer is over a frame, so hook any
	 * same-origin frames and translate their coordinates back to the viewport.
	 */
	const hooked = new WeakSet();
	function hookFrames() {
		document.querySelectorAll("iframe").forEach((frame) => {
			let doc = null;
			try {
				doc = frame.contentDocument;
			} catch {}
			if (!doc || hooked.has(doc)) return;
			hooked.add(doc);
			doc.addEventListener(
				"pointermove",
				(e) => {
								const rect = frame.getBoundingClientRect();
					pointer = { x: e.clientX + rect.left, y: e.clientY + rect.top };
				},
				true
			);
		});
	}
	const frameSweep = setInterval(hookFrames, 1500);

	/* ── Global keys ────────────────────────────────────────────── */

	window.addEventListener(
		"keydown",
		(e) => {
			if (capturingHotkey) {
				e.preventDefault();
				e.stopPropagation();
				if (e.key !== "Escape") {
					cfg.hotkey = e.key.toLowerCase();
					save();
				}
				capturingHotkey = false;
				render();
				return;
			}
			if (!button.hidden && e.key.toLowerCase() === cfg.hotkey) {
				const tag = document.activeElement?.tagName;
				if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
				// Holding the key repeated keydown, flipping it on and straight
				// back off - which read as "I pressed it and nothing happened".
				if (e.repeat) return;
				e.preventDefault();
				running ? stop() : start();
			}
		},
		true
	);

	/* ── Open / close ───────────────────────────────────────────── */

	function place() {
		if (cfg.left != null && cfg.top != null) {
			win.style.left = `${Math.min(cfg.left, innerWidth - 340)}px`;
			win.style.top = `${Math.min(cfg.top, innerHeight - 200)}px`;
			win.style.right = "auto";
			win.style.bottom = "auto";
		}
	}

	/**
	 * The close animation used to hide the window on a timer that a quick
	 * re-open couldn't cancel, so every other press looked like it did
	 * nothing. The pending hide is now cancelled on the way back in.
	 */
	let hideTimer = null;

	function setOpen(next) {
		open = next;
		button.classList.toggle("on", open);
		clearTimeout(hideTimer);

		if (open) {
			win.hidden = false;
			place();
			setTimeout(() => {
				if (open) win.classList.add("is-open");
			}, 16);
		} else {
			win.classList.remove("is-open");
			hideTimer = setTimeout(() => {
				if (!open) win.hidden = true;
			}, 220);
		}
	}

	button.addEventListener("click", () => setOpen(!open));

	render();

	return {
		/** Called by the launcher tile: reveals the tray icon and the window. */
		show() {
			button.hidden = false;
			setOpen(true);
		},
		toggle() {
			button.hidden = false;
			setOpen(!open);
		},
		isOpen: () => open,
		destroy() {
			stop();
			clearInterval(frameSweep);
			window.removeEventListener("pointermove", trackParent, true);
			win.remove();
			button.remove();
		},
	};
}
