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
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

const PROVIDERS = [
	{ id: "vidlink", label: "VidLink", movie: (id) => `https://vidlink.pro/movie/${id}`, tv: (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}` },
	{ id: "vidking", label: "VidKing", movie: (id) => `https://www.vidking.net/embed/movie/${id}`, tv: (id, s, e) => `https://www.vidking.net/embed/tv/${id}/${s}/${e}` },
	{ id: "vidsrc", label: "VidSrc", movie: (id) => `https://vidsrc.xyz/embed/movie/${id}`, tv: (id, s, e) => `https://vidsrc.xyz/embed/tv/${id}/${s}-${e}` },
	{ id: "vidsrccc", label: "VidSrc CC", movie: (id) => `https://vidsrc.cc/v2/embed/movie/${id}`, tv: (id, s, e) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}` },
	{ id: "embedsu", label: "EmbedSU", movie: (id) => `https://embed.su/embed/movie/${id}`, tv: (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}` },
	{ id: "multiembed", label: "MultiEmbed", movie: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1`, tv: (id, s, e) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}` },
];

const ROW_SOURCES = [
	{ label: "Trending Movies", path: "/trending/movie/day", type: "movie" },
	{ label: "Trending Series", path: "/trending/tv/day", type: "tv" },
	{ label: "Popular Movies", path: "/movie/popular", type: "movie" },
	{ label: "Popular Series", path: "/tv/popular", type: "tv" },
	{ label: "Top Rated Movies", path: "/movie/top_rated", type: "movie" },
	{ label: "Top Rated Series", path: "/tv/top_rated", type: "tv" },
];

const browseFrame = document.getElementById("browse-frame");
const moviesFrame = document.getElementById("movies-frame");
const browseStage = document.getElementById("browse-stage");
const moviesStage = document.getElementById("movies-stage");
const browseHome = document.getElementById("browse-home");
const browseStep = document.getElementById("browse-step");
const moviesStep = document.getElementById("movies-step");
const browseError = document.getElementById("browse-error");
const moviesError = document.getElementById("movies-error");
const moviesRows = document.getElementById("movies-rows");
const moviesBrowse = document.getElementById("movies-browse");
const moviesPlayer = document.getElementById("movies-player");
const moviesSearchForm = document.getElementById("movies-search-form");
const moviesSearchInput = document.getElementById("movies-search");
const playerTitle = document.getElementById("player-title");
const playerSub = document.getElementById("player-sub");
const playerServer = document.getElementById("player-server");
const playerEp = document.getElementById("player-ep");
const playerSeason = document.getElementById("player-season");
const playerEpisode = document.getElementById("player-episode");
const searchForm = document.getElementById("rise-search-form");
const searchInput = document.getElementById("rise-search");
const tabs = document.querySelectorAll("[data-rise-tab]");
const panels = document.querySelectorAll("[data-rise-panel]");

let router;
let browseToken = 0;
let moviesToken = 0;
let moviesLoaded = false;
let providerId = "vidlink";
let player = null;

function esc(s) {
	const d = document.createElement("div");
	d.textContent = s == null ? "" : s;
	return d.innerHTML;
}

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
	return `https://www.google.com/search?q=${encodeURIComponent(t)}`;
}

function titleOf(item) {
	return item.title || item.name || "Untitled";
}

function yearOf(item) {
	return (item.release_date || item.first_air_date || "").slice(0, 4);
}

function scoreOf(item) {
	return item.vote_average ? Number(item.vote_average).toFixed(1) : "";
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

function buildEmbedUrl() {
	if (!player) return "";
	const prov = PROVIDERS.find((p) => p.id === providerId) || PROVIDERS[0];
	return player.type === "tv" ? prov.tv(player.tmdbId, player.season, player.episode) : prov.movie(player.tmdbId);
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
				else if (s.phase === "loading") setStep(moviesStep, "buffering…");
			},
			onLocationChange: () => {},
			allowFailover: true,
		});
	} catch (err) {
		if (token !== moviesToken) return;
		moviesFrame.removeEventListener("load", onLoad);
		showMoviesError(err?.message || "Could not load movie — try another server");
	}
}

async function tmdb(path) {
	const sep = path.includes("?") ? "&" : "?";
	const res = await fetch(`https://api.themoviedb.org/3${path}${sep}api_key=${TMDB_KEY}`);
	if (!res.ok) throw new Error("Could not load movies");
	return res.json();
}

function cardHtml(item, type) {
	const title = titleOf(item);
	const poster = item.poster_path ? `${TMDB_IMG}${item.poster_path}` : "";
	const score = scoreOf(item);
	const year = yearOf(item);
	const bits = [year || "-", type === "tv" ? "Series" : "Movie"];
	if (score) bits.push(`★ ${score}`);
	return `<article class="movie-card" data-id="${item.id}" data-type="${type}" tabindex="0" role="button">
		<div class="movie-card__art">
			${poster ? `<img src="${poster}" alt="${esc(title)}" loading="lazy" />` : `<span class="movie-card__blank">🍿</span>`}
			<span class="movie-card__play" aria-hidden="true">▶</span>
		</div>
		<div class="meta">
			<p class="title">${esc(title)}</p>
			<p class="sub">${bits.join(" · ")}</p>
		</div>
	</article>`;
}

function bindCards(root) {
	root.querySelectorAll(".movie-card[data-id]").forEach((card) => {
		const open = () => {
			const id = Number(card.dataset.id);
			const type = card.dataset.type;
			openPlayer({ id, title: card.querySelector(".title")?.textContent, media_type: type }, type);
		};
		card.addEventListener("click", open);
		card.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				open();
			}
		});
	});
}

function rowHtml(label, items, type) {
	return `<section class="movies-row"><h3>${esc(label)}</h3><div class="movies-grid">${items.map((i) => cardHtml(i, type)).join("")}</div></section>`;
}

async function loadMovies() {
	moviesRows.innerHTML = `<p class="movies-empty">Loading library…</p>`;
	moviesError.hidden = true;
	try {
		const chunks = await Promise.all(ROW_SOURCES.map(async (row) => ({ row, data: await tmdb(row.path) })));
		moviesRows.innerHTML = "";
		for (const { row, data } of chunks) {
			const items = (data.results || []).slice(0, 16);
			if (!items.length) continue;
			moviesRows.insertAdjacentHTML("beforeend", rowHtml(row.label, items, row.type));
		}
		bindCards(moviesRows);
	} catch (err) {
		moviesRows.innerHTML = `<p class="movies-empty">${esc(err?.message || "Movies unavailable")}</p>`;
	}
}

async function searchMovies(query) {
	const q = String(query || "").trim();
	if (!q) return loadMovies();
	moviesRows.innerHTML = `<p class="movies-empty">Searching…</p>`;
	try {
		const data = await tmdb(`/search/multi?query=${encodeURIComponent(q)}`);
		const items = (data.results || []).filter((i) => i.media_type === "movie" || i.media_type === "tv");
		moviesRows.innerHTML = "";
		if (!items.length) {
			moviesRows.innerHTML = `<p class="movies-empty">No results for “${esc(q)}”</p>`;
			return;
		}
		const movies = items.filter((i) => i.media_type === "movie");
		const tv = items.filter((i) => i.media_type === "tv");
		if (movies.length) moviesRows.insertAdjacentHTML("beforeend", rowHtml("Movies", movies, "movie"));
		if (tv.length) moviesRows.insertAdjacentHTML("beforeend", rowHtml("Series", tv, "tv"));
		bindCards(moviesRows);
	} catch (err) {
		moviesRows.innerHTML = `<p class="movies-empty">${esc(err?.message || "Search failed")}</p>`;
	}
}

function fillServerSelect() {
	playerServer.innerHTML = PROVIDERS.map((p) => `<option value="${p.id}"${p.id === providerId ? " selected" : ""}>${esc(p.label)}</option>`).join("");
}

function openPlayer(item, type) {
	const id = item.id;
	if (!id) return;
	switchTab("movies");
	player = { type, tmdbId: id, title: titleOf(item), season: 1, episode: 1 };
	providerId = playerServer.value || "vidlink";
	moviesBrowse.hidden = true;
	moviesPlayer.hidden = false;
	playerTitle.textContent = player.title;
	playerSub.textContent = type === "tv" ? "Series" : "Movie";
	playerEp.hidden = type !== "tv";
	moviesError.hidden = true;
	navigateMoviesEmbed(buildEmbedUrl());
}

function closePlayer() {
	player = null;
	moviesToken += 1;
	moviesFrame.classList.remove("loaded");
	moviesFrame.removeAttribute("src");
	moviesPlayer.hidden = true;
	moviesBrowse.hidden = false;
	moviesStage.hidden = true;
	moviesError.hidden = true;
}

function switchTab(name) {
	tabs.forEach((t) => t.classList.toggle("on", t.dataset.riseTab === name));
	panels.forEach((p) => p.classList.toggle("on", p.dataset.risePanel === name));
	if (name === "movies") {
		if (!moviesLoaded) {
			moviesLoaded = true;
			fillServerSelect();
			loadMovies();
		}
	} else if (player) {
		closePlayer();
	}
}

tabs.forEach((tab) => {
	tab.addEventListener("click", () => switchTab(tab.dataset.riseTab));
});

searchForm.addEventListener("submit", (e) => {
	e.preventDefault();
	switchTab("browse");
	navigateBrowse(searchInput.value);
});

moviesSearchForm?.addEventListener("submit", (e) => {
	e.preventDefault();
	switchTab("movies");
	searchMovies(moviesSearchInput?.value || "");
});

document.getElementById("browse-retry")?.addEventListener("click", () => {
	browseError.hidden = true;
	browseHome.hidden = false;
});

document.getElementById("player-back")?.addEventListener("click", closePlayer);

document.getElementById("movies-retry")?.addEventListener("click", () => {
	if (!player) return;
	const idx = PROVIDERS.findIndex((p) => p.id === providerId);
	providerId = PROVIDERS[(idx + 1) % PROVIDERS.length].id;
	playerServer.value = providerId;
	moviesError.hidden = true;
	navigateMoviesEmbed(buildEmbedUrl());
});

playerServer?.addEventListener("change", () => {
	if (!player) return;
	providerId = playerServer.value;
	moviesError.hidden = true;
	navigateMoviesEmbed(buildEmbedUrl());
});

document.getElementById("player-ep-go")?.addEventListener("click", () => {
	if (!player || player.type !== "tv") return;
	player.season = Math.max(1, Number(playerSeason.value) || 1);
	player.episode = Math.max(1, Number(playerEpisode.value) || 1);
	moviesError.hidden = true;
	navigateMoviesEmbed(buildEmbedUrl());
});

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
