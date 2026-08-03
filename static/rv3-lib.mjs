/** Arctic-compatible rv3 URL encoding for embed links. */

const RV3_KEY = Uint8Array.from(
	[215, 109, 196, 84, 233, 61, 142, 52, 178, 73, 201, 25],
	(v, i) => v ^ ((41 + 17 * i) & 255)
);

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

export function decodeRv3(value) {
	if (!value.startsWith("rv3.")) return value;
	const hex = value.slice(4);
	if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return "";
	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i += 1) {
		const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
		out[i] = byte ^ RV3_KEY[i % RV3_KEY.length] ^ ((41 + 29 * i) & 255);
	}
	return new TextDecoder("utf-8", { fatal: true }).decode(out);
}
