import {
	isProxyPath,
	parseProxyPath,
	toProxyBrowserPath,
} from "./proxy-url.js";

const RELOAD_FLAG = "riseub-sw-reload";

let controller = null;
let controllerPromise = null;
let ready = false;
/** Most recently created frame - used to mint proxy URLs for media. */
let lastFrame = null;
let utilityFrame = null;

export function getController() {
	return controller;
}

export function getBrowseFrame() {
	return lastFrame;
}

async function initController() {
	if (!controllerPromise) {
		controllerPromise = (async () => {
			controller = await initBootstrap();
			// The controller still has to hand its frame table to the service
			// worker. Navigating before that lands means the request escapes the
			// worker and Express answers with "Cannot GET /~/sj/…".
			await controller.wait?.();
			if (navigator.serviceWorker) {
				await navigator.serviceWorker.ready;
				if (!navigator.serviceWorker.controller) {
					await new Promise((resolve) => {
						const done = setTimeout(resolve, 4000);
						navigator.serviceWorker.addEventListener(
							"controllerchange",
							() => {
								clearTimeout(done);
								resolve();
							},
							{ once: true }
						);
					});
				}
			}
			// A page that loaded before the worker took control can never be
			// proxied - its requests bypass the worker entirely. One reload
			// fixes it for good, which is what "it works after a refresh" was.
			if (navigator.serviceWorker && !navigator.serviceWorker.controller) {
				if (!sessionStorage.getItem(RELOAD_FLAG)) {
					sessionStorage.setItem(RELOAD_FLAG, "1");
					location.reload();
					await new Promise(() => {});
				}
			} else {
				sessionStorage.removeItem(RELOAD_FLAG);
			}

			// The worker drops its frame table when it restarts; re-register on
			// every wake so long-lived tabs keep working.
			navigator.serviceWorker?.addEventListener("controllerchange", () => {
				controller?.wait?.().catch(() => {});
			});

			ready = true;
			return controller;
		})();
	}
	return controllerPromise;
}

/** Boot the proxy runtime. Safe to call repeatedly. */
export async function ensureScramjet() {
	await initController();
	return { controller };
}

export function isProxyReady() {
	return ready;
}

/**
 * Wrap a tab's iframe in its own proxy frame so tabs navigate independently.
 * `onUrl` fires whenever the framed page changes location.
 */
export function createBrowseFrame(iframe, { onUrl } = {}) {
	if (!controller) throw new Error("Proxy not ready");

	const holder = {};
	const plugins = [
		new $scramjetUtils.HttpCachePlugin(),
		new $scramjetUtils.UrlWatcherPlugin((url) => {
			const href = typeof url === "string" ? url : url?.href;
			if (!href) return;
			// Sites that call pushState/replaceState with an undefined url make
			// the watcher resolve it against the page - "…/undefined". That's
			// never a real address, so don't let it reach the address bar.
			if (/\/undefined$/.test(href)) return;
			onUrl?.(href);
		}),
		new $scramjetUtils.CatchEscapedLinksPlugin((url) => {
			if (!holder.frame) return new URL("/", location.origin);
			// Plugin may hand us a URL object or a raw string - never read
			// `.href` off a string (that's undefined → …/undefined in the bar).
			const href = typeof url === "string" ? url : url?.href;
			if (!href || href === "undefined") {
				return new URL("/", location.origin);
			}
			return new URL(
				toProxyBrowserPath(holder.frame.prefix, href),
				location.origin
			);
		}),
	];

	holder.frame = controller.createFrame(iframe, { plugins });
	lastFrame = holder.frame;
	return holder.frame;
}

export function createMediaFrame(element) {
	if (!controller) throw new Error("Scramjet not initialized");
	const frame = controller.createFrame(element, { plugins: [] });
	lastFrame = lastFrame || frame;
	return frame;
}

/**
 * Dedicated zero-size frame for media/AI proxy URLs. Never reuse a browse or
 * game frame here - those go away or change prefix and break SoundCloud streams.
 */
export async function ensureUtilityFrame() {
	await initController();
	if (!utilityFrame) {
		const el = document.createElement("iframe");
		el.setAttribute("aria-hidden", "true");
		el.title = "proxy helper";
		el.style.cssText =
			"position:absolute;width:0;height:0;border:0;opacity:0;pointer-events:none";
		document.body.appendChild(el);
		utilityFrame = controller.createFrame(el, { plugins: [] });
	}
	if (!lastFrame) lastFrame = utilityFrame;
	return utilityFrame;
}

export function proxify(url, frame) {
	const href = typeof url === "string" ? url : url?.href;
	if (!href || href === "undefined") return url;
	// Prefer the stable utility frame so music keeps working after Browse/Games.
	const use = frame || utilityFrame || lastFrame;
	if (!use) return url;
	return location.origin + use.prefix + encodeURIComponent(href);
}

export { isProxyPath, parseProxyPath, toProxyBrowserPath };
