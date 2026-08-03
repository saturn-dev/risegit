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
})();
