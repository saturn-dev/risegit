(function () {
	var host = location.hostname;
	if (
		location.protocol === "http:" &&
		host !== "localhost" &&
		host !== "127.0.0.1" &&
		host !== "[::1]"
	) {
		location.replace(location.href.replace(/^http:/, "https:"));
	}

	window.__RISEUB_STATIC = true;
	window.__RISEUB_SKIP_GATE = true;

	if (window.__RISEUB_SRCDOC) return;
	if (window.__RISEUB_EMBED_TARGET) return;

	var KEY = [215, 109, 196, 84, 233, 61, 142, 52, 178, 73, 201, 25];
	function rv3Decode(v) {
		if (!v || v.indexOf("rv3.") !== 0) return v;
		var hex = v.slice(4);
		if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return "";
		var key = KEY.map(function (x, i) {
			return x ^ ((41 + 17 * i) & 255);
		});
		var bytes = new Uint8Array(hex.length / 2);
		for (var i = 0; i < bytes.length; i++) {
			bytes[i] =
				parseInt(hex.slice(i * 2, i * 2 + 2), 16) ^
				key[i % key.length] ^
				((41 + 29 * i) & 255);
		}
		try {
			return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
		} catch (e) {
			return "";
		}
	}
	function norm(raw) {
		var t = String(raw || "").trim();
		if (!t) return "";
		if (/^https?:\/\//i.test(t)) return t;
		if (/^\/\//.test(t)) return "https:" + t;
		return "https://" + t.replace(/^\/+/, "");
	}
	var p = new URLSearchParams(location.search);
	var hash = location.hash.replace(/^#/, "").trim();
	var fromHash = hash ? norm(rv3Decode(hash) || decodeURIComponent(hash)) : "";
	var io = p.get("$io") || p.get("url") || p.get("u") || "";
	var fromQuery = io ? norm(rv3Decode(io) || decodeURIComponent(io)) : "";
	if (fromHash) window.__RISEUB_EMBED_TARGET = fromHash;
	else if (fromQuery) window.__RISEUB_EMBED_TARGET = fromQuery;
})();
