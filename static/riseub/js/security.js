import { notify } from "./toast.js";

const KEY = "riseub-security";
const MASK_DIR = "/storage/images/mask";

/**
 * Rise keeps a themed mark; the rest borrow a real site's icon and title so a
 * glance at the tab strip gives nothing away.
 */
export const MASKS = [
	{ id: "rise", label: "Rise", title: "RiseUB", icon: null },
	{
		id: "googledrive",
		label: "Google Drive",
		title: "Google Drive",
		icon: `${MASK_DIR}/googledrive.png`,
	},
	// Canvas calls its landing page Dashboard, so the tab should too.
	{ id: "canvas", label: "Canvas", title: "Dashboard", icon: `${MASK_DIR}/canvas.png` },
	{ id: "nearpod", label: "Nearpod", title: "Nearpod", icon: `${MASK_DIR}/near-pod.png` },
	{ id: "google", label: "Google", title: "Google", icon: `${MASK_DIR}/google.png` },
];

const DEFAULTS = { mask: "rise", clickOff: false, antiClose: false };

export function getSecurity() {
	try {
		return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
	} catch {
		return { ...DEFAULTS };
	}
}

export function setSecurity(patch) {
	const next = { ...getSecurity(), ...patch };
	try {
		localStorage.setItem(KEY, JSON.stringify(next));
	} catch {}
	apply();
	return next;
}

/* ── Favicon ────────────────────────────────────────────────────── */

function linkEl() {
	let link = document.querySelector('link[rel="icon"]');
	if (!link) {
		link = document.createElement("link");
		link.rel = "icon";
		document.head.appendChild(link);
	}
	return link;
}

/**
 * The Rise mark drawn at the live accent colour, so the favicon follows the
 * theme the same way the rest of the chrome does.
 */
function themedFavicon() {
	const styles = getComputedStyle(document.documentElement);
	const accent = (styles.getPropertyValue("--accent") || "#7ff0c4").trim();
	const bg = (styles.getPropertyValue("--bg") || "#0a0c0b").trim();
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
		<rect width="64" height="64" rx="14" fill="${bg}"/>
		<path d="M20 46V18h16a10 10 0 0 1 0 20h-6l12 8" fill="none" stroke="${accent}"
			stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
	</svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/* ── Click-off blur ─────────────────────────────────────────────── */

function veil() {
	let el = document.getElementById("rise-veil");
	if (!el) {
		el = document.createElement("div");
		el.id = "rise-veil";
		el.className = "rise-veil";
		el.setAttribute("aria-hidden", "true");
		document.body.appendChild(el);
	}
	return el;
}

let veilBound = false;

function bindVeil() {
	if (veilBound) return;
	veilBound = true;

	const update = () => {
		const on = getSecurity().clickOff;
		// Hidden tab or an unfocused window both count as "looked away".
		const away = document.hidden || !document.hasFocus();
		document.documentElement.classList.toggle("is-veiled", on && away);
	};

	document.addEventListener("visibilitychange", update);
	window.addEventListener("blur", update);
	window.addEventListener("focus", update);
	// Clicking the veil brings it back rather than trapping you behind it.
	veil().addEventListener("click", () => {
		document.documentElement.classList.remove("is-veiled");
	});
	update();
}

/* ── Anti close ─────────────────────────────────────────────────── */

function onBeforeUnload(e) {
	e.preventDefault();
	// Browsers show their own wording; a non-empty value is what triggers it.
	e.returnValue = "Are you sure you want to close?";
	return e.returnValue;
}

/* ── Apply ──────────────────────────────────────────────────────── */

export function apply() {
	const cfg = getSecurity();
	const mask = MASKS.find((m) => m.id === cfg.mask) || MASKS[0];

	document.title = mask.title;
	linkEl().href = mask.icon || themedFavicon();

	veil();
	bindVeil();
	if (!cfg.clickOff) document.documentElement.classList.remove("is-veiled");

	window.removeEventListener("beforeunload", onBeforeUnload);
	if (cfg.antiClose) window.addEventListener("beforeunload", onBeforeUnload);
}

/* ── Cloaks ─────────────────────────────────────────────────────── */

/** Full-page frame markup used by every cloak. */
function shellDoc(href, title, iconHref) {
	return `<!doctype html><html><head><meta charset="utf-8">
<title>${title}</title>
<link rel="icon" href="${iconHref}">
<style>html,body{margin:0;height:100%;background:#0a0c0b;overflow:hidden}
iframe{border:0;width:100%;height:100%;display:block}</style>
</head><body><iframe src="${href}" allow="autoplay; fullscreen; clipboard-read; clipboard-write"></iframe></body></html>`;
}

function maskBits() {
	const cfg = getSecurity();
	const mask = MASKS.find((m) => m.id === cfg.mask) || MASKS[0];
	return {
		title: mask.title,
		icon: mask.icon
			? new URL(mask.icon, location.origin).href
			: themedFavicon(),
	};
}

/** about:blank window holding the site in a frame; the opener then closes. */
export function cloakAboutBlank() {
	const win = window.open("about:blank", "_blank");
	if (!win) {
		notify("Popup blocked", "Allow popups for this site and try again", "error");
		return false;
	}
	const { title, icon } = maskBits();
	win.document.write(shellDoc(location.origin, title, icon));
	win.document.close();
	// Only close ourselves once the new window really has the page.
	setTimeout(() => {
		try {
			window.close();
		} catch {}
		// Scripts can't always close a tab they didn't open - say so.
		setTimeout(() => {
			if (!window.closed) {
				notify("Cloak open", "Close this tab yourself; the cloaked one is ready", "info");
			}
		}, 400);
	}, 350);
	return true;
}

/** Same idea, but the container is served from a blob: URL. */
export function cloakBlob() {
	const { title, icon } = maskBits();
	const blob = new Blob([shellDoc(location.origin, title, icon)], {
		type: "text/html",
	});
	const url = URL.createObjectURL(blob);
	const win = window.open(url, "_blank");
	if (!win) {
		URL.revokeObjectURL(url);
		notify("Popup blocked", "Allow popups for this site and try again", "error");
		return false;
	}
	setTimeout(() => {
		try {
			window.close();
		} catch {}
	}, 350);
	return true;
}

/** A chromeless window sized to the screen, like the pop-out player. */
export function cloakWindowed() {
	const w = screen.availWidth;
	const h = screen.availHeight;
	const features = `popup=yes,width=${w},height=${h},left=0,top=0,menubar=no,toolbar=no,location=no,status=no`;
	const win = window.open("about:blank", "_blank", features);
	if (!win) {
		notify("Popup blocked", "Allow popups for this site and try again", "error");
		return false;
	}
	const { title, icon } = maskBits();
	win.document.write(shellDoc(location.origin, title, icon));
	win.document.close();
	try {
		win.moveTo(0, 0);
		win.resizeTo(w, h);
	} catch {}
	setTimeout(() => {
		try {
			window.close();
		} catch {}
	}, 350);
	return true;
}
