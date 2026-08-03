import {
	r as initRuntime,
	R as Router,
	W as WispResolver,
	d as decodeTarget,
	B as bundledList,
	a as listUrls,
	H as hasBackend,
} from "../assets/resolver-kJ4LsXVq.js";
import { searchUrl } from "./rise-theme.js";
import { initSettings, syncTaskbarIndicator } from "./rise-settings.js";

const TMDB_KEY = "3432e32fd16a6ae8c7c201bf31e360e5";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
const TMDB_BACK = "https://image.tmdb.org/t/p/w1280";

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

const views = {
	browse: document.getElementById("view-browse"),
	movies: document.getElementById("view-movies"),
	settings: document.getElementById("view-settings"),
};
const tabList = document.getElementById("tab-list");
const browseFrame = document.getElementById("browse-frame");
const browseStage = document.getElementById("browse-stage");
const browseHome = document.getElementById("browse-home");
const browseStep = document.getElementById("browse-step");
const browseError = document.getElementById("browse-error");
const addressForm = document.getElementById("address-form");
const addressInput = document.getElementById("address-input");
const newtabForm = document.getElementById("newtab-form");
const newtabInput = document.getElementById("newtab-input");
const moviesRows = document.getElementById("movies-rows");
const moviesHero = document.getElementById("movies-hero");
const moviesBrowse = document.getElementById("movies-browse");
const moviesPlayer = document.getElementById("movies-player");
const moviesFrame = document.getElementById("movies-frame");
const moviesStage = document.getElementById("movies-stage");
const moviesStep = document.getElementById("movies-step");
const moviesError = document.getElementById("movies-error");
const playerTitle = document.getElementById("player-title");
const playerSub = document.getElementById("player-sub");
const playerServer = document.getElementById("player-server");
const playerEp = document.getElementById("player-ep");
const playerSeason = document.getElementById("player-season");
const playerEpisode = document.getElementById("player-episode");
const moviesSearchForm = document.getElementById("movies-search-form");
const moviesSearchInput = document.getElementById("movies-search");
const moviesTopbar = document.getElementById("movies-topbar");

let router;
let routerReady = false;
let pendingBrowse = "";
let browseToken = 0;
let moviesToken = 0;
let moviesLoaded = false;
let providerId = "vidlink";
let player = null;
let activeView = "browse";
const catalog = new Map();

const tabs = [{ id: 1, title: "New Tab", url: "" }];
let activeTabId = 1;
let nextTabId = 2;

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
	return searchUrl(t);
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

function activeTab() {
	return tabs.find((t) => t.id === activeTabId) || tabs[0];
}

function renderTabs() {
	if (!tabList) return;
	tabList.innerHTML = "";
	for (const tab of tabs) {
		const el = document.createElement("div");
		el.className = `tab${tab.id === activeTabId ? " is-active" : ""}`;
		el.dataset.tabId = String(tab.id);
		el.setAttribute("role", "button");
		el.tabIndex = 0;
		el.innerHTML = `<span class="tab__fav" aria-hidden="true">🌐</span><span class="tab__title">${esc(tab.title)}</span>${tabs.length > 1 ? `<button type="button" class="tab__close" data-close="${tab.id}" aria-label="Close tab">×</button>` : ""}`;
		el.addEventListener("click", (e) => {
			if (e.target.closest("[data-close]")) return;
			activeTabId = tab.id;
			addressInput && (addressInput.value = tab.url.replace(/^https?:\/\//, ""));
			renderTabs();
			if (tab.url) navigateBrowse(tab.url, { fromTab: true });
			else showHome();
		});
		el.querySelector("[data-close]")?.addEventListener("click", (e) => {
			e.stopPropagation();
			const idx = tabs.findIndex((t) => t.id === tab.id);
			if (idx < 0 || tabs.length === 1) return;
			tabs.splice(idx, 1);
			if (activeTabId === tab.id) activeTabId = tabs[Math.max(0, idx - 1)].id;
			renderTabs();
			const cur = activeTab();
			if (cur.url) navigateBrowse(cur.url, { fromTab: true });
			else showHome();
		});
		tabList.append(el);
	}
	syncTaskbarIndicator();
}

function showHome() {
	browseHome.hidden = false;
	browseStage.hidden = true;
	browseError.hidden = true;
	browseFrame.classList.remove("loaded");
}

function switchView(name) {
	activeView = name;
	if (window.__riseSwitchView) window.__riseSwitchView(name);
	else {
		Object.entries(views).forEach(([key, el]) => {
			if (!el) return;
			const on = key === name;
			el.hidden = !on;
			el.classList.toggle("on", on);
		});
		document.querySelectorAll("[data-view-nav]").forEach((btn) => {
			btn.classList.toggle("on", btn.dataset.viewNav === name);
		});
		syncTaskbarIndicator();
	}
	if (name === "movies" && !moviesLoaded) {
		moviesLoaded = true;
		fillServerSelect();
		loadMovies();
	}
	if (name === "settings" && views.settings && !views.settings.childElementCount) initSettings(views.settings);
	if (name !== "movies" && player) closePlayer(false);
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

async function navigateBrowse(url, opts = {}) {
	const target = normalizeUrl(url);
	if (!target) return showHome();
	if (!router) {
		pendingBrowse = target;
		browseHome.hidden = true;
		browseStage.hidden = false;
		setStep(browseStep, "starting proxy…");
		return;
	}

	const token = ++browseToken;

	const tab = activeTab();
	if (!opts.fromTab) {
		tab.url = target;
		tab.title = target.replace(/^https?:\/\//, "").slice(0, 36) || "Tab";
		renderTabs();
		addressInput.value = tab.url.replace(/^https?:\/\//, "");
	}

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
	return `<article class="card" data-id="${item.id}" data-type="${type}" tabindex="0" role="button">
		<div class="card__art">
			${poster ? `<img class="card__img" src="${poster}" alt="${esc(title)}" loading="lazy" />` : `<span class="card__blank">🍿</span>`}
			<span class="card__shade"></span>
			${score ? `<span class="card__score">★ ${score}</span>` : ""}
			<button type="button" class="card__play" data-play aria-label="Play">▶</button>
			<div class="card__caption"><h3>${esc(title)}</h3><p class="card__meta">${bits.join(" · ")}</p></div>
		</div>
	</article>`;
}

function bindCards(root) {
	root.querySelectorAll(".card[data-id]").forEach((card) => {
		const open = () => {
			const id = Number(card.dataset.id);
			const type = card.dataset.type;
			openPlayer({ id, title: card.querySelector("h3")?.textContent, media_type: type }, type);
		};
		card.addEventListener("click", (e) => {
			if (e.target.closest("[data-play]")) {
				e.stopPropagation();
				open();
				return;
			}
			open();
		});
		card.querySelectorAll(".card__img").forEach((img) => {
			img.addEventListener("load", () => img.classList.add("is-loaded"));
		});
	});
}

function rowHtml(label, items, type) {
	return `<section class="row"><header class="row__head"><h2>${esc(label)}</h2>${items.length > 8 ? `<span class="row__count">${items.length}</span>` : ""}</header>
	<div class="row__viewport"><div class="row__track">${items.map((i) => cardHtml(i, type)).join("")}</div></div></section>`;
}

function renderHero(item, type) {
	if (!item) {
		moviesHero.innerHTML = "";
		return;
	}
	const title = titleOf(item);
	const backdrop = item.backdrop_path ? `${TMDB_BACK}${item.backdrop_path}` : item.poster_path ? `${TMDB_IMG}${item.poster_path}` : "";
	const overview = item.overview || "";
	moviesHero.innerHTML = `<div class="hero"><div class="hero__media">${backdrop ? `<div class="hero__slide on" style="background-image:url('${backdrop}')"></div>` : ""}</div><div class="hero__veil"></div>
	<div class="hero__inner"><div class="hero__body"><h2 class="hero__wordmark">${esc(title)}</h2><p class="hero__overview">${esc(overview)}</p>
	<div class="hero__actions"><button type="button" class="btn btn--primary" data-hero-play>▶ Play</button></div></div></div></div>`;
	moviesHero.querySelector("[data-hero-play]")?.addEventListener("click", () => openPlayer(item, type));
}

async function loadMovies() {
	moviesRows.innerHTML = `<p class="media-empty">Loading library…</p>`;
	try {
		const chunks = await Promise.all(ROW_SOURCES.map(async (row) => ({ row, data: await tmdb(row.path) })));
		moviesRows.innerHTML = "";
		const heroChunk = chunks[0];
		const heroItem = heroChunk?.data?.results?.[0];
		if (heroItem) renderHero(heroItem, heroChunk.row.type);
		for (const { row, data } of chunks) {
			const items = (data.results || []).slice(0, 16);
			if (!items.length) continue;
			moviesRows.insertAdjacentHTML("beforeend", rowHtml(row.label, items, row.type));
		}
		bindCards(moviesRows);
		if (heroItem) moviesHero.querySelector("[data-hero-play]")?.addEventListener("click", () => openPlayer(heroItem, heroChunk.row.type));
	} catch (err) {
		moviesRows.innerHTML = `<p class="media-empty">${err?.message || "Movies unavailable"}</p>`;
	}
}

async function searchMovies(query) {
	const q = String(query || "").trim();
	if (!q) return loadMovies();
	moviesRows.innerHTML = `<p class="media-empty">Searching…</p>`;
	moviesHero.innerHTML = "";
	try {
		const data = await tmdb(`/search/multi?query=${encodeURIComponent(q)}`);
		const items = (data.results || []).filter((i) => i.media_type === "movie" || i.media_type === "tv");
		moviesRows.innerHTML = "";
		if (!items.length) {
			moviesRows.innerHTML = `<p class="media-empty">No results for “${esc(q)}”</p>`;
			return;
		}
		const movies = items.filter((i) => i.media_type === "movie");
		const tv = items.filter((i) => i.media_type === "tv");
		if (movies.length) moviesRows.insertAdjacentHTML("beforeend", rowHtml("Movies", movies, "movie"));
		if (tv.length) moviesRows.insertAdjacentHTML("beforeend", rowHtml("Series", tv, "tv"));
		bindCards(moviesRows);
	} catch (err) {
		moviesRows.innerHTML = `<p class="media-empty">${err?.message || "Search failed"}</p>`;
	}
}

function fillServerSelect() {
	playerServer.innerHTML = PROVIDERS.map((p) => `<option value="${p.id}"${p.id === providerId ? " selected" : ""}>${esc(p.label)}</option>`).join("");
}

function openPlayer(item, type) {
	const id = item.id;
	if (!id) return;
	switchView("movies");
	player = { type, tmdbId: id, title: titleOf(item), season: 1, episode: 1 };
	providerId = playerServer.value || "vidlink";
	moviesBrowse.hidden = true;
	moviesPlayer.hidden = false;
	moviesTopbar.hidden = true;
	playerTitle.textContent = player.title;
	playerSub.textContent = type === "tv" ? "Series" : "Movie";
	playerEp.hidden = type !== "tv";
	moviesError.hidden = true;
	navigateMoviesEmbed(buildEmbedUrl());
}

function closePlayer(backToBrowse = true) {
	player = null;
	moviesToken += 1;
	moviesFrame.classList.remove("loaded");
	moviesFrame.removeAttribute("src");
	moviesPlayer.hidden = true;
	moviesBrowse.hidden = false;
	moviesTopbar.hidden = false;
	moviesStage.hidden = true;
	moviesError.hidden = true;
}

window.__riseSwitchViewFull = switchView;
window.__riseNavigate = (q) => {
	switchView("browse");
	navigateBrowse(q || addressInput?.value || newtabInput?.value || "");
};
window.__riseSearchMovies = (q) => {
	switchView("movies");
	searchMovies(q || moviesSearchInput?.value || "");
};
window.__riseNewTab = () => {
	const tab = { id: nextTabId++, title: "New Tab", url: "" };
	tabs.push(tab);
	activeTabId = tab.id;
	renderTabs();
	showHome();
	if (addressInput) addressInput.value = "";
};

document.getElementById("tab-new")?.addEventListener("click", () => window.__riseNewTab());

document.querySelectorAll("[data-view-nav]").forEach((btn) => {
	btn.addEventListener("click", (e) => {
		e.preventDefault();
		switchView(btn.dataset.viewNav);
	});
});

addressForm?.addEventListener("submit", (e) => {
	e.preventDefault();
	switchView("browse");
	navigateBrowse(addressInput?.value || "");
});

newtabForm?.addEventListener("submit", (e) => {
	e.preventDefault();
	switchView("browse");
	navigateBrowse(newtabInput?.value || "");
});

document.getElementById("nav-reload")?.addEventListener("click", () => {
	const tab = activeTab();
	if (tab.url) navigateBrowse(tab.url);
});

document.getElementById("nav-back")?.addEventListener("click", () => {
	try {
		browseFrame.contentWindow?.history.back();
	} catch {}
});

document.getElementById("nav-forward")?.addEventListener("click", () => {
	try {
		browseFrame.contentWindow?.history.forward();
	} catch {}
});

moviesSearchForm?.addEventListener("submit", (e) => {
	e.preventDefault();
	switchView("movies");
	searchMovies(moviesSearchInput?.value || "");
});

document.getElementById("browse-retry")?.addEventListener("click", showHome);
document.getElementById("movies-retry")?.addEventListener("click", () => {
	if (!player) return;
	const idx = PROVIDERS.findIndex((p) => p.id === providerId);
	providerId = PROVIDERS[(idx + 1) % PROVIDERS.length].id;
	playerServer.value = providerId;
	moviesError.hidden = true;
	navigateMoviesEmbed(buildEmbedUrl());
});
document.getElementById("player-back")?.addEventListener("click", () => closePlayer());
playerServer.addEventListener("change", () => {
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

moviesBrowse?.addEventListener("scroll", () => {
	moviesTopbar?.classList.toggle("is-stuck", (moviesBrowse.scrollTop || 0) > 24);
});

renderTabs();
switchView("browse");

initRuntime()
	.finally(() => {
		document.documentElement.dataset.palette = "mint";
	})
	.then(() => bootProxy())
	.then(() => {
		routerReady = true;
		if (pendingBrowse) {
			const url = pendingBrowse;
			pendingBrowse = "";
			navigateBrowse(url);
			return;
		}
		const boot = targetFromEnv();
		if (boot) {
			if (addressInput) addressInput.value = boot.replace(/^https?:\/\//, "");
			navigateBrowse(boot);
		}
	})
	.catch((err) => showBrowseError(err?.message || "Failed to boot proxy"));
