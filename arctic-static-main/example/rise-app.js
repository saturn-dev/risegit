import {
	r as initRuntime,
	R as Router,
	W as WispResolver,
	d as decodeTarget,
	B as bundledList,
	a as listUrls,
	H as hasBackend,
} from "../assets/resolver-kJ4LsXVq.js";

const TMDB_KEY = "3432e32fd16a6ae8c7c201bf31e360e5";
const TMDB_IMG = "https://image.tmdb.org/t/p/w342";

const browseFrame = document.getElementById("browse-frame");
const moviesFrame = document.getElementById("movies-frame");
const browseStage = document.getElementById("browse-stage");
const moviesStage = document.getElementById("movies-stage");
const browseHome = document.getElementById("browse-home");
const browseStep = document.getElementById("browse-step");
const moviesStep = document.getElementById("movies-step");
const browseError = document.getElementById("browse-error");
const moviesError = document.getElementById("movies-error");
const moviesGrid = document.getElementById("movies-grid");
const searchForm = document.getElementById("rise-search-form");
const searchInput = document.getElementById("rise-search");
const tabs = document.querySelectorAll("[data-rise-tab]");
const panels = document.querySelectorAll("[data-rise-panel]");

let router;
let browseToken = 0;
let moviesToken = 0;
let activeTab = "browse";

function targetFromEnv() {
	if (window.__RISE_EMBED_TARGET) return window.__RISE_EMBED_TARGET;
	const hash = location.hash.replace(/^#/, "").trim();
	if (hash) return decodeTarget(hash) || hash;
	const p = new URLSearchParams(location.search);
	const io = p.get("$io") || p.get("url") || "";
	return io ? decodeTarget(io) || io : "";
}

function normalizeUrl(raw) {
	const t = String(raw || "").trim();
	if (!t) return "";
	if (/^https?:\/\//i.test(t)) return t;
	if (/^\/\//.test(t)) return `https:${t}`;
	if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(t)) return `https://${t}`;
	const q = encodeURIComponent(t);
	return `https://www.google.com/search?q=${q}`;
}

function setStep(el, text) {
	if (el) el.textContent = text;
}

function showBrowseError(msg) {
	browseStage.hidden = true;
	browseHome.hidden = true;
	browseError.hidden = false;
	browseError.querySelector("p").textContent = msg;
}

function showMoviesError(msg) {
	moviesStage.hidden = true;
	moviesError.hidden = false;
	moviesError.querySelector("p").textContent = msg;
}

async function bootProxy() {
	const wisp = new WispResolver({
		readOverride: () => new URLSearchParams(location.search).get("wisp") || "",
		hasBackend,
		listUrls,
		bundledList,
	});
	router = new Router(async (hint) => (await wisp.resolve(hint)).url, {
		onWispFailure: (url) => wisp.reject(url),
		onWispSuccess: (url) => wisp.confirm(url),
	});
}

async function navigateBrowse(url) {
	const token = ++browseToken;
	const target = normalizeUrl(url);
	if (!target) return;

	browseHome.hidden = true;
	browseError.hidden = true;
	browseStage.hidden = false;
	browseFrame.classList.remove("loaded");
	setStep(browseStep, "connecting…");

	const onLoad = () => {
		if (token !== browseToken) return;
		browseFrame.classList.add("loaded");
		browseStage.hidden = true;
	};

	browseFrame.addEventListener("load", onLoad, { once: true });

	try {
		await router.navigate({
			url: target,
			frame: browseFrame,
			backend: "scramjet2",
			token,
			isStale: () => token !== browseToken,
			onStatus: (s) => {
				if (token !== browseToken) return;
				if (s.phase === "resolving-wisp") setStep(browseStep, "connecting…");
				else if (s.phase === "connecting") setStep(browseStep, "starting proxy…");
				else if (s.phase === "loading") setStep(browseStep, "loading…");
			},
			onLocationChange: () => {},
			allowFailover: true,
		});
	} catch (err) {
		if (token !== browseToken) return;
		browseFrame.removeEventListener("load", onLoad);
		showBrowseError(err?.message || "Proxy failed to start");
	}
}

async function navigateMoviesEmbed(url) {
	const token = ++moviesToken;
	moviesError.hidden = true;
	moviesStage.hidden = false;
	moviesFrame.classList.remove("loaded");
	setStep(moviesStep, "loading player…");

	const onLoad = () => {
		if (token !== moviesToken) return;
		moviesFrame.classList.add("loaded");
		moviesStage.hidden = true;
	};

	moviesFrame.addEventListener("load", onLoad, { once: true });

	try {
		await router.navigate({
			url,
			frame: moviesFrame,
			backend: "scramjet2",
			token,
			isStale: () => token !== moviesToken,
			onStatus: (s) => {
				if (token !== moviesToken) return;
				if (s.phase === "connecting") setStep(moviesStep, "starting player…");
			},
			onLocationChange: () => {},
			allowFailover: true,
		});
	} catch (err) {
		if (token !== moviesToken) return;
		moviesFrame.removeEventListener("load", onLoad);
		showMoviesError(err?.message || "Could not load movie");
	}
}

async function tmdb(path) {
	const res = await fetch(`https://api.themoviedb.org/3${path}${path.includes("?") ? "&" : "?"}api_key=${TMDB_KEY}`);
	if (!res.ok) throw new Error("Could not load movies");
	return res.json();
}

function movieCard(item) {
	const isTv = item.media_type === "tv" || item.first_air_date;
	const title = item.title || item.name || "Untitled";
	const year = (item.release_date || item.first_air_date || "").slice(0, 4);
	const poster = item.poster_path ? `${TMDB_IMG}${item.poster_path}` : "";
	const btn = document.createElement("button");
	btn.type = "button";
	btn.className = "movie-card";
	btn.innerHTML = `
		<img src="${poster || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300'/%3E"}" alt="" loading="lazy" />
		<div class="meta">
			<p class="title">${title}</p>
			<p class="sub">${isTv ? "Series" : "Movie"}${year ? ` · ${year}` : ""}</p>
		</div>`;
	btn.addEventListener("click", () => {
		const embed = isTv
			? `https://www.vidking.net/embed/tv/${item.id}/1/1`
			: `https://www.vidking.net/embed/movie/${item.id}`;
		switchTab("movies");
		navigateMoviesEmbed(embed);
	});
	return btn;
}

async function loadMovies() {
	moviesGrid.innerHTML = "";
	moviesError.hidden = true;
	moviesStage.hidden = false;
	setStep(moviesStep, "fetching library…");
	try {
		const data = await tmdb("/trending/all/day");
		moviesStage.hidden = true;
		const items = (data.results || []).filter((item) => item.media_type !== "person");
		if (!items.length) throw new Error("No movies found");
		for (const item of items) moviesGrid.append(movieCard(item));
	} catch (err) {
		moviesStage.hidden = true;
		moviesGrid.innerHTML = `<p class="movies-empty">${err?.message || "Movies unavailable"}</p>`;
	}
}

function switchTab(name) {
	activeTab = name;
	tabs.forEach((t) => t.classList.toggle("on", t.dataset.riseTab === name));
	panels.forEach((p) => p.classList.toggle("on", p.dataset.risePanel === name));
	if (name === "movies" && !moviesGrid.childElementCount) loadMovies();
}

tabs.forEach((tab) => {
	tab.addEventListener("click", () => switchTab(tab.dataset.riseTab));
});

searchForm.addEventListener("submit", (e) => {
	e.preventDefault();
	switchTab("browse");
	navigateBrowse(searchInput.value);
});

document.getElementById("browse-retry")?.addEventListener("click", () => {
	browseError.hidden = true;
	browseHome.hidden = false;
});

document.getElementById("movies-retry")?.addEventListener("click", loadMovies);

initRuntime()
	.finally(() => {
		document.documentElement.dataset.palette = "mint";
	})
	.then(() => bootProxy())
	.then(() => {
		const boot = targetFromEnv();
		if (boot) {
			searchInput.value = boot.replace(/^https?:\/\//, "");
			navigateBrowse(boot);
		}
	})
	.catch((err) => showBrowseError(err?.message || "Failed to boot proxy"));
