export const PROXY_PREFIX = "/~/sj/";

/** Matches /~/sj/{session}/{frame}/{encoded-target-url} */
const PROXY_PATH_RE = /^\/~\/sj\/[^/]+\/[^/]+\/(.+)$/;

export function isProxyPath(pathname) {
	return pathname.startsWith(PROXY_PREFIX);
}

export function parseProxyPath(pathname) {
	const match = pathname.match(PROXY_PATH_RE);
	if (!match) return null;

	try {
		return decodeURIComponent(match[1]);
	} catch {
		return null;
	}
}

export function toProxyBrowserPath(framePrefix, targetUrl) {
	const href = typeof targetUrl === "string" ? targetUrl : targetUrl?.href;
	if (!framePrefix || !href || href === "undefined") return framePrefix || "/";
	return `${framePrefix}${encodeURIComponent(href)}`;
}

export function proxyLocationFromFrame(frameElement) {
	const src = frameElement?.src;
	if (!src) return null;

	const url = new URL(src, location.origin);
	return `${url.pathname}${url.search}${url.hash}`;
}
