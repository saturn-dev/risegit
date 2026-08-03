async function initBootstrap() {
	const base = new URL("./vendor/", location.href).href;

	function loadScript(src) {
		return new Promise((resolve, reject) => {
			const s = document.createElement("script");
			s.src = src;
			s.async = false;
			s.onload = () => resolve();
			s.onerror = () => reject(new Error("Failed to load " + src));
			document.head.appendChild(s);
		});
	}

	if (!window.RiseUBWisp) {
		throw new Error("wisp-resolver.js must load before bootstrap-init.js");
	}

	const wisp = await window.RiseUBWisp.resolve();

	const reg = await navigator.serviceWorker.register(new URL("./sw.js", location.href).href, {
		type: "classic",
		updateViaCache: "none",
	});
	await navigator.serviceWorker.ready;

	await loadScript(base + "scramjet/scramjet.js");
	await loadScript(base + "controller/controller.api.js");
	await loadScript(base + "scramjet-utils/scramjet-utils.js");
	await loadScript(base + "libcurl/libcurl-client.js");

	const transport = new window.LibcurlTransport.LibcurlClient({ wisp });
	const { Controller, config } = window.$scramjetController;
	config.injectPath = base + "controller/controller.inject.js";
	config.wasmPath = base + "scramjet/scramjet.wasm";
	config.scramjetPath = base + "scramjet/scramjet.js";

	window.__RISEUB_WISP = wisp;
	return new Controller({ serviceworker: reg, transport });
}
