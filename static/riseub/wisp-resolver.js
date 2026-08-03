(function (global) {
	"use strict";

	const WISP_LIST_URL =
		"https://cdn.jsdelivr.net/gh/skidding-code/arctic-wisps@main/wisp.txt";
	const CACHE_KEY = "riseub_wisp_cache_v1";
	const PROBE_MS = 6000;

	function decodeAw1List(line) {
		var parts = line.trim().split(".");
		if (parts.length !== 3 || parts[0] !== "aw1" || !parts[1]) return null;
		try {
			var b64 = parts[2].replace(/-/g, "+").replace(/_/g, "/");
			var pad = "=".repeat((4 - (b64.length % 4)) % 4);
			var bin = atob(b64 + pad);
			var raw = new Uint8Array(bin.length);
			for (var i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
			var mask = new TextEncoder().encode("arctic-list-mask:" + parts[1] + ":1");
			var out = new Uint8Array(raw.length);
			for (var j = 0; j < raw.length; j++) out[j] = raw[j] ^ mask[j % mask.length];
			return new TextDecoder("utf-8", { fatal: true }).decode(out);
		} catch (e) {
			return null;
		}
	}

	function parseWispList(text) {
		var body = text.trimStart().startsWith("aw1.") ? decodeAw1List(text) : text;
		if (!body) return [];
		var seen = {};
		var out = [];
		body.split("\n").forEach(function (line) {
			line = line.trim();
			if (!line || line[0] === "#") return;
			var url = normalizeWisp(line);
			if (url && !seen[url]) {
				seen[url] = true;
				out.push(url);
			}
		});
		return out;
	}

	function normalizeWisp(raw) {
		var v = String(raw || "").trim();
		if (!v) return null;
		try {
			var u = new URL(v);
			if (u.protocol !== "wss:" && u.protocol !== "ws:") return null;
			if (u.protocol === "ws:") {
				var h = u.hostname;
				if (h !== "localhost" && h !== "127.0.0.1" && h !== "[::1]" && !h.endsWith(".localhost"))
					return null;
			}
			if (u.search || u.hash) return null;
			if (!u.pathname.endsWith("/")) u.pathname += "/";
			return u.toString();
		} catch (e) {
			return null;
		}
	}

	function probeWisp(url) {
		return new Promise(function (resolve, reject) {
			var done = false;
			var ws;
			function finish(fn, val) {
				if (done) return;
				done = true;
				clearTimeout(timer);
				try {
					ws && ws.close();
				} catch (e) {}
				fn(val);
			}
			var timer = setTimeout(function () {
				finish(reject, new Error("timeout"));
			}, PROBE_MS);
			try {
				ws = new WebSocket(url);
				ws.binaryType = "arraybuffer";
			} catch (e) {
				return finish(reject, e);
			}
			ws.onmessage = function (ev) {
				var buf = ev.data;
				if (!(buf instanceof ArrayBuffer) || buf.byteLength < 5) return;
				var view = new DataView(buf);
				if (view.getUint8(0) === 3 && view.getUint32(1, true) === 0) finish(resolve, url);
			};
			ws.onerror = function () {
				finish(reject, new Error("error"));
			};
			ws.onclose = function () {
				finish(reject, new Error("closed"));
			};
		});
	}

	function readCache() {
		try {
			var raw = localStorage.getItem(CACHE_KEY);
			if (!raw) return null;
			var data = JSON.parse(raw);
			return normalizeWisp(data.url);
		} catch (e) {
			return null;
		}
	}

	function writeCache(url) {
		try {
			localStorage.setItem(CACHE_KEY, JSON.stringify({ url: url, storedAt: Date.now() }));
		} catch (e) {}
	}

	async function loadCandidates() {
		var list = [];
		try {
			var res = await fetch(WISP_LIST_URL + "?t=" + Date.now(), { cache: "no-store" });
			if (res.ok) list = parseWispList(await res.text());
		} catch (e) {}
		return list;
	}

	async function resolve() {
		if (window.__RISEUB_WISP) {
			var forced = normalizeWisp(window.__RISEUB_WISP);
			if (forced) return forced;
		}

		var cached = readCache();
		if (cached) {
			try {
				await probeWisp(cached);
				return cached;
			} catch (e) {}
		}

		var candidates = await loadCandidates();
		for (var i = 0; i < candidates.length; i++) {
			try {
				var url = await probeWisp(candidates[i]);
				writeCache(url);
				return url;
			} catch (e) {}
		}
		throw new Error("No public wisp server reachable");
	}

	global.RiseUBWisp = { resolve, parseWispList, normalizeWisp };
})(typeof window !== "undefined" ? window : globalThis);
