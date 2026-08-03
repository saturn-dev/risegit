/** Arctic-compatible rv3 URL encoding for embed links and SVG hashes. */

const RV3_KEY = Uint8Array.from(
	[215, 109, 196, 84, 233, 61, 142, 52, 178, 73, 201, 25],
	(v, i) => v ^ ((41 + 17 * i) & 255)
);

/** Encode a target URL as `rv3.{hex}` (same as Arctic static). */
export function encodeRv3(url) {
	const bytes = new TextEncoder().encode(url);
	let hex = "";
	for (let i = 0; i < bytes.length; i += 1) {
		hex += (bytes[i] ^ RV3_KEY[i % RV3_KEY.length] ^ ((41 + 29 * i) & 255))
			.toString(16)
			.padStart(2, "0");
	}
	return `rv3.${hex}`;
}

/** Decode `rv3.{hex}` or pass through plain URLs / hash fragments. */
export function decodeEmbedTarget(raw) {
	const value = String(raw || "").trim();
	if (!value) return "";

	if (value.startsWith("rv3.")) {
		const hex = value.slice(4);
		if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return "";
		const out = new Uint8Array(hex.length / 2);
		for (let i = 0; i < out.length; i += 1) {
			const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
			out[i] = byte ^ RV3_KEY[i % RV3_KEY.length] ^ ((41 + 29 * i) & 255);
		}
		try {
			return new TextDecoder("utf-8", { fatal: true }).decode(out);
		} catch {
			return "";
		}
	}

	if (value.startsWith("aw1.")) {
		try {
			const b64 = value.slice(4).replace(/-/g, "+").replace(/_/g, "/");
			const padded = `${b64}${"=".repeat((4 - (b64.length % 4)) % 4)}`;
			const bin = atob(padded);
			const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
			return new TextDecoder().decode(bytes);
		} catch {
			return "";
		}
	}

	if (/^https?:\/\//i.test(value)) return value;

	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

/** Read target from hash, Arctic-style query params, or RiseUB `url` param. */
export function readEmbedTarget(locationObj = location) {
	const params = new URLSearchParams(locationObj.search);
	const hash = locationObj.hash.replace(/^#/, "").trim();

	const fromHash = hash ? decodeEmbedTarget(hash) : "";
	if (fromHash) return normalizeTarget(fromHash);

	const io = params.get("$io") || params.get("url") || params.get("u") || "";
	if (io) return normalizeTarget(decodeEmbedTarget(io) || io);

	return "";
}

function normalizeTarget(input) {
	const trimmed = String(input || "").trim();
	if (!trimmed) return "";
	if (/^https?:\/\//i.test(trimmed)) return trimmed;
	if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
	return `https://${trimmed.replace(/^\/+/, "")}`;
}
