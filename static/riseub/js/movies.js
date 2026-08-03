import { openModal } from "./modal.js";
import { notify } from "./toast.js";
import { dropdown } from "./dropdown.js";

const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
const TMDB_BACKDROP = "https://image.tmdb.org/t/p/w1280";
const TMDB_LOGO = "https://image.tmdb.org/t/p/w500";
const TMDB_STILL = "https://image.tmdb.org/t/p/w300";
const STORAGE_KEY = "riseub-movies-saved";

const HERO_COUNT = 5;
const HERO_INTERVAL = 9000;

const PROVIDERS = [
	{
		id: "vidlink",
		label: "VidLink",
		movie: (id) => `https://vidlink.pro/movie/${id}`,
		tv: (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}`,
	},
	{
		id: "vidking",
		label: "VidKing",
		movie: (id) => `https://www.vidking.net/embed/movie/${id}`,
		tv: (id, s, e) => `https://www.vidking.net/embed/tv/${id}/${s}/${e}`,
	},
	{
		id: "vidsrc",
		label: "VidSrc",
		movie: (id) => `https://vidsrc.xyz/embed/movie/${id}`,
		tv: (id, s, e) => `https://vidsrc.xyz/embed/tv/${id}/${s}-${e}`,
	},
	{
		id: "vidsrccc",
		label: "VidSrc CC",
		movie: (id) => `https://vidsrc.cc/v2/embed/movie/${id}`,
		tv: (id, s, e) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}`,
	},
	{
		id: "embedsu",
		label: "EmbedSU",
		movie: (id) => `https://embed.su/embed/movie/${id}`,
		tv: (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}`,
	},
	{
		id: "multiembed",
		label: "MultiEmbed",
		movie: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1`,
		tv: (id, s, e) =>
			`https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`,
	},
];

const ROW_SOURCES = [
	{ key: "trendMovie", label: "Trending Movies", url: "/api/tmdb/movie/trending", type: "movie" },
	{ key: "trendTv", label: "Trending Series", url: "/api/tmdb/tv/trending", type: "tv" },
	{ key: "popMovie", label: "Popular Movies", url: "/api/tmdb/movie/popular", type: "movie" },
	{ key: "popTv", label: "Popular Series", url: "/api/tmdb/tv/popular", type: "tv" },
	{ key: "topMovie", label: "Top Rated Movies", url: "/api/tmdb/movie/top_rated", type: "movie" },
	{ key: "topTv", label: "Acclaimed Series", url: "/api/tmdb/tv/top_rated", type: "tv" },
];

const ICONS = {
	play: '<polygon points="6 3 20 12 6 21 6 3"/>',
	info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
	heart:
		'<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
	star: '<path d="M12 2.6l2.95 5.98 6.6.96-4.77 4.65 1.12 6.57L12 17.66 6.1 20.76l1.12-6.57L2.45 9.54l6.6-.96z"/>',
	left: '<path d="m15 18-6-6 6-6"/>',
	right: '<path d="m9 18 6-6-6-6"/>',
	search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
	back: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
	close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
	clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
	layers:
		'<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
	popcorn:
		'<path d="M18 8a2 2 0 0 0 0-4 2 2 0 0 0-4 0 2 2 0 0 0-4 0 2 2 0 0 0-4 0 2 2 0 0 0 0 4"/><path d="M4 8h16l-1.5 12.5A2 2 0 0 1 16.5 22h-9a2 2 0 0 1-2-1.5Z"/><path d="M10 8v14"/><path d="M14 8v14"/>',
	home:
		'<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
	skipForward:
		'<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>',
	episodes:
		'<path d="M21 15V6"/><path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5"/><path d="M12 12H3"/><path d="M16 6H3"/><path d="M12 18H3"/>',
	check: '<path d="M20 6 9 17l-5-5"/>',
	server:
		'<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 6h.01"/><path d="M6 18h.01"/>',
};

function icon(name, cls = "") {
	return `<svg class="lucide ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

function loadSaved() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) return JSON.parse(raw);
	} catch {}
	return { items: [], groups: [] };
}

function saveSaved(data) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	} catch {}
}

function mediaType(item) {
	if (item.media_type === "tv" || (!item.title && item.name)) return "tv";
	return "movie";
}

function titleOf(item) {
	return item.title || item.name || "Untitled";
}

function yearOf(item) {
	return (item.release_date || item.first_air_date || "").slice(0, 4);
}

function scoreOf(item) {
	const v = Number(item.vote_average || 0);
	return v > 0 ? v.toFixed(1) : "";
}

function runtimeOf(details) {
	const mins = details?.runtime || details?.episode_run_time?.[0];
	if (!mins) return "";
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	return h ? `${h}h ${m}m` : `${m}m`;
}

function esc(s) {
	const d = document.createElement("div");
	d.textContent = s == null ? "" : s;
	return d.innerHTML;
}

export function initMovies(root, {
	ensureScramjet,
	createMediaFrame,
	ensureUtilityFrame,
	proxify,
}) {
	/**
	 * Artwork is relayed by our own server, so the page never talks to
	 * image.tmdb.org directly. (The proxy worker only claims requests coming
	 * from inside a proxied frame, so a plain <img> can't ride it.)
	 */
	const img = (url) => url.replace(/^https:\/\/image\.tmdb\.org\//, "/api/tmdb/img/");
	const proxyReady = Promise.resolve();
	let seasonDd = null;

	let saved = loadSaved();
	let rows = [];
	let searchResults = [];
	let searchQuery = "";
	let searchTimer = null;
	let loading = true;
	let heroSlides = [];
	let heroIndex = 0;
	let heroTimer = null;
	let player = null;
	let playerFrame = null;
	let unblockPopups = null;

	/** Every title we've seen, so a click can find its record again. */
	const index = new Map();
	const detailsCache = new Map();

	const keyOf = (id, type) => `${type}:${id}`;

	function remember(item, type) {
		const k = keyOf(item.id, type);
		if (!index.has(k)) index.set(k, { ...item, media_type: type });
		return index.get(k);
	}

	function lookup(id, type) {
		return (
			index.get(keyOf(id, type)) ||
			saved.items
				.filter((i) => i.tmdbId === id && i.type === type)
				.map((i) => ({
					id: i.tmdbId,
					title: i.title,
					poster_path: i.poster_path,
					backdrop_path: i.backdrop_path,
					release_date: i.release_date,
					first_air_date: i.first_air_date,
					vote_average: i.vote_average,
					overview: i.overview,
					media_type: i.type,
				}))[0] ||
			null
		);
	}

	function blockPopups() {
		unblockPopups?.();
		const prevOpen = window.open;
		window.open = () => null;

		const blockAux = (e) => {
			if (e.button === 1) {
				e.preventDefault();
				e.stopPropagation();
			}
		};

		document.addEventListener("auxclick", blockAux, true);

		unblockPopups = () => {
			window.open = prevOpen;
			document.removeEventListener("auxclick", blockAux, true);
			if (iframe._sealTimer) clearInterval(iframe._sealTimer);
			unblockPopups = null;
		};
	}

	const el = document.createElement("div");
	el.className = "media-page movies-page";
	el.innerHTML = `
		<div class="media-topbar" data-topbar>
			<div class="media-brand">
				${icon("popcorn", "media-brand__icon")}
				<div>
					<h1>Cinema</h1>
					<p class="media-sub" data-stats>Loading library…</p>
				</div>
			</div>
			<button type="button" class="media-search-btn" data-search-open aria-label="Search">
				${icon("search")}
			</button>
		</div>
		<div class="media-alert" data-error hidden></div>
		<div class="media-content" data-catalog></div>
		<div class="media-player" data-player hidden>
			<div class="player-body">
				<div class="player-main">
					<div class="player-stage">
						<iframe data-player-frame title="Video player" sandbox="allow-scripts allow-same-origin allow-forms allow-presentation" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>

						<nav class="player-rail" aria-label="Player controls">
							<button type="button" class="rail-btn" data-back data-label="Back">${icon("back")}</button>
							<button type="button" class="rail-btn" data-next-ep data-label="Next episode" hidden>${icon("skipForward", "lucide--fill")}</button>
							<button type="button" class="rail-btn" data-eps data-label="Episodes" hidden>${icon("episodes")}</button>
							<span class="rail-sep"></span>
							<button type="button" class="rail-btn" data-servers data-label="Servers">${icon("server")}</button>
						</nav>
						<button type="button" class="rail-hide" data-rail-toggle aria-label="Show controls">${icon("chevronRight")}</button>

						<div class="player-crumb" data-crumb></div>
					</div>
				</div>
			</div>

			<aside class="ep-drawer" data-ep-drawer hidden>
				<header class="ep-drawer__head">
					<div>
						<h2 data-drawer-title></h2>
						<p data-drawer-sub></p>
					</div>
					<button type="button" class="ep-drawer__x" data-eps-close aria-label="Close">${icon("close")}</button>
				</header>
				<div class="ep-drawer__controls">
					<div class="ep-season" data-season-slot></div>
					<div class="ep-search">
						${icon("search")}
						<input type="search" placeholder="Search episodes…" data-ep-search aria-label="Search episodes" />
					</div>
				</div>
				<div class="ep-drawer__list" data-ep-list></div>
			</aside>
			<div class="ep-drawer__scrim" data-eps-close hidden></div>
		</div>

		<div class="search-overlay" data-search-overlay hidden>
			<div class="search-overlay__scrim" data-search-close></div>
			<div class="search-overlay__panel" role="dialog" aria-modal="true" aria-label="Search">
				<div class="search-overlay__bar">
					<div class="search-overlay__field">
						${icon("search")}
						<input type="search" placeholder="Search movies…" data-search aria-label="Search movies and series" />
					</div>
					<button type="button" class="search-overlay__x" data-search-close aria-label="Close">${icon("close")}</button>
				</div>
				<p class="search-overlay__hint">Search across movies, series and everything in the library</p>
				<div class="search-overlay__filters" data-search-filters>
					<button type="button" class="chip on" data-filter="all">All</button>
					<button type="button" class="chip" data-filter="movie">Movies</button>
					<button type="button" class="chip" data-filter="tv">TV Shows</button>
				</div>
				<div class="search-overlay__results" data-search-results></div>
			</div>
		</div>
		<div class="sheet" data-sheet hidden>
			<div class="sheet__scrim" data-sheet-close></div>
			<div class="sheet__panel" role="dialog" aria-modal="true" aria-label="Title details" data-sheet-panel></div>
		</div>`;
	root.appendChild(el);

	const statsEl = el.querySelector("[data-stats]");
	const errorEl = el.querySelector("[data-error]");
	const catalogEl = el.querySelector("[data-catalog]");
	const topbarEl = el.querySelector("[data-topbar]");
	const playerEl = el.querySelector("[data-player]");
	const searchInput = el.querySelector("[data-search]");
	const iframe = el.querySelector("[data-player-frame]");
	const sheetEl = el.querySelector("[data-sheet]");
	const sheetPanel = el.querySelector("[data-sheet-panel]");
	const railNext = el.querySelector("[data-next-ep]");
	const railEps = el.querySelector("[data-eps]");
	const crumbEl = el.querySelector("[data-crumb]");
	const drawerEl = el.querySelector("[data-ep-drawer]");
	const drawerScrim = el.querySelector(".ep-drawer__scrim");
	const drawerTitle = el.querySelector("[data-drawer-title]");
	const drawerSub = el.querySelector("[data-drawer-sub]");
	const seasonSlot = el.querySelector("[data-season-slot]");
	const epSearch = el.querySelector("[data-ep-search]");
	const epList = el.querySelector("[data-ep-list]");
	const searchOverlay = el.querySelector("[data-search-overlay]");
	const searchResultsEl = el.querySelector("[data-search-results]");

	let providerId = PROVIDERS[0].id;
	let searchFilter = "all";
	let episodes = [];

	// Posters fade in as they decode - capture covers load/error for every image.
	const markLoaded = (e) => {
		if (e.target.tagName === "IMG") e.target.classList.add("is-loaded");
	};
	catalogEl.addEventListener("load", markLoaded, true);
	catalogEl.addEventListener("error", markLoaded, true);

	catalogEl.addEventListener("scroll", () => {
		topbarEl.classList.toggle("is-stuck", catalogEl.scrollTop > 24);
	});

	function showError(msg) {
		if (!msg) {
			errorEl.hidden = true;
			return;
		}
		errorEl.textContent = msg;
		errorEl.hidden = false;
	}

	/* ── Favourites ─────────────────────────────────────────────── */

	function isFav(id, type) {
		return saved.items.some((i) => i.tmdbId === id && i.type === type);
	}

	function toggleFav(item, type) {
		const id = item.id ?? item.tmdbId;
		if (isFav(id, type)) {
			saved.items = saved.items.filter(
				(i) => !(i.tmdbId === id && i.type === type)
			);
		} else {
			saved.items.unshift({
				id: String(Date.now()),
				type,
				tmdbId: id,
				title: titleOf(item),
				poster_path: item.poster_path,
				backdrop_path: item.backdrop_path,
				release_date: item.release_date,
				first_air_date: item.first_air_date,
				vote_average: item.vote_average,
				overview: item.overview,
				groupId: null,
				season: type === "tv" ? 1 : undefined,
				episode: type === "tv" ? 1 : undefined,
				createdAt: Date.now(),
			});
		}
		saveSaved(saved);
		refreshFavState();
		updateStats();
	}

	function refreshFavState() {
		el.querySelectorAll("[data-fav]").forEach((btn) => {
			const host = btn.closest("[data-id]");
			if (!host) return;
			btn.classList.toggle(
				"on",
				isFav(Number(host.dataset.id), host.dataset.type)
			);
		});
	}

	function updateStats() {
		if (loading) {
			statsEl.textContent = "Loading library…";
			return;
		}
		const total = index.size;
		statsEl.textContent = `${total} titles · ${saved.items.length} saved`;
	}

	/* ── Cards ──────────────────────────────────────────────────── */

	function cardHtml(item, type) {
		const title = titleOf(item);
		const poster = item.poster_path ? img(TMDB_IMG + item.poster_path) : "";
		const score = scoreOf(item);
		const year = yearOf(item);
		const bits = [year || "-", type === "tv" ? "Series" : "Movie"];
		if (score) bits.push(`★ ${score}`);
		return `
			<article class="card" data-id="${item.id}" data-type="${type}" tabindex="0" role="button" aria-label="${esc(title)}">
				<div class="card__art">
					${
						poster
							? `<img class="card__img" src="${poster}" alt="${esc(title)}" loading="lazy" decoding="async" />`
							: `<span class="card__blank">${icon("popcorn")}</span>`
					}
					<span class="card__shade"></span>
					${score ? `<span class="card__score">${icon("star", "lucide--fill")}${score}</span>` : ""}
					<button type="button" class="card__fav${isFav(item.id, type) ? " on" : ""}" data-fav aria-label="Save to library">${icon("heart")}</button>
					<button type="button" class="card__play" data-play aria-label="Play ${esc(title)}">${icon("play", "lucide--fill")}</button>
					<div class="card__caption">
						<h3>${esc(title)}</h3>
						<p class="card__meta">${bits.join(" · ")}</p>
						${item.overview ? `<p class="card__blurb">${esc(item.overview)}</p>` : ""}
					</div>
				</div>
			</article>`;
	}

	function skeletonCards(n) {
		return Array.from(
			{ length: n },
			() => `<div class="card card--skeleton"><div class="card__art skeleton"></div></div>`
		).join("");
	}

	function rowHtml(row) {
		return `
			<section class="row" data-row>
				<header class="row__head">
					<h2>${esc(row.label)}</h2>
					${row.items.length > 8 ? `<span class="row__count">${row.items.length}</span>` : ""}
				</header>
				<div class="row__viewport">
					<button type="button" class="row__arrow row__arrow--prev" data-prev aria-label="Scroll left">${icon("left")}</button>
					<div class="row__track" data-track>
						${row.items.map((item) => cardHtml(item, row.type || mediaType(item))).join("")}
					</div>
					<button type="button" class="row__arrow row__arrow--next" data-next aria-label="Scroll right">${icon("right")}</button>
				</div>
			</section>`;
	}

	function skeletonRow(label) {
		return `
			<section class="row">
				<header class="row__head"><h2>${esc(label)}</h2></header>
				<div class="row__viewport"><div class="row__track">${skeletonCards(8)}</div></div>
			</section>`;
	}

	/* ── Hero ───────────────────────────────────────────────────── */

	function heroSkeleton() {
		return `
			<section class="hero hero--skeleton">
				<div class="hero__veil"></div>
				<div class="hero__inner">
					<div class="skeleton hero__sk-title"></div>
					<div class="skeleton hero__sk-meta"></div>
					<div class="skeleton hero__sk-line"></div>
					<div class="skeleton hero__sk-line hero__sk-line--short"></div>
					<div class="hero__sk-actions">
						<div class="skeleton hero__sk-btn"></div>
						<div class="skeleton hero__sk-btn hero__sk-btn--ghost"></div>
					</div>
				</div>
			</section>`;
	}

	function heroSlideBody(slide) {
		const { item, details, logo } = slide;
		const type = mediaType(item);
		const title = titleOf(item);
		const score = scoreOf(item) || scoreOf(details || {});
		const year = yearOf(item) || yearOf(details || {});
		const genres = (details?.genres || []).slice(0, 3);
		const runtime = runtimeOf(details);
		const seasons = details?.number_of_seasons;
		return `
			<div class="hero__body" data-hero-body>
				<div class="hero__title">
					${
						logo
							? `<img class="hero__logo" src="${img(TMDB_LOGO + logo)}" alt="${esc(title)}" />`
							: `<h2 class="hero__wordmark">${esc(title)}</h2>`
					}
				</div>
				<div class="hero__meta">
					${score ? `<span class="hero__score">${icon("star", "lucide--fill")}${score}</span>` : ""}
					${year ? `<span>${year}</span>` : ""}
					<span class="hero__pill">${type === "tv" ? "TV Series" : "Movie"}</span>
					${runtime ? `<span class="hero__dot-sep">${icon("clock")}${runtime}</span>` : ""}
					${seasons ? `<span class="hero__dot-sep">${icon("layers")}${seasons} season${seasons > 1 ? "s" : ""}</span>` : ""}
				</div>
				${
					genres.length
						? `<div class="hero__genres">${genres
								.map((g) => `<span class="tag">${esc(g.name)}</span>`)
								.join("")}</div>`
						: ""
				}
				<p class="hero__overview">${esc(details?.overview || item.overview || "")}</p>
				<div class="hero__actions">
					<button type="button" class="btn btn--accent" data-hero-play>${icon("play", "lucide--fill")}<span>Play</span></button>
					<button type="button" class="btn btn--glass" data-hero-info>${icon("info")}<span>Details</span></button>
					<button type="button" class="btn btn--icon${isFav(item.id, type) ? " on" : ""}" data-hero-fav aria-label="Save to library">${icon("heart")}</button>
				</div>
			</div>`;
	}

	function heroHtml() {
		if (!heroSlides.length) return "";
		return `
			<section class="hero" data-hero>
				<div class="hero__media">
					${heroSlides
						.map(
							(s, i) =>
								`<div class="hero__slide${i === 0 ? " on" : ""}" style="background-image:url('${img(TMDB_BACKDROP + s.item.backdrop_path)}')"></div>`
						)
						.join("")}
				</div>
				<div class="hero__veil"></div>
				<div class="hero__inner" data-hero-stage>${heroSlideBody(heroSlides[0])}</div>
				<div class="hero__dots" data-hero-dots>
					${heroSlides
						.map(
							(_, i) =>
								`<button type="button" class="hero__dot${i === 0 ? " on" : ""}" data-dot="${i}" aria-label="Show title ${i + 1}"></button>`
						)
						.join("")}
				</div>
			</section>`;
	}

	function showHeroSlide(next, { user = false } = {}) {
		const hero = catalogEl.querySelector("[data-hero]");
		if (!hero || !heroSlides.length) return;
		heroIndex = (next + heroSlides.length) % heroSlides.length;

		hero.querySelectorAll(".hero__slide").forEach((s, i) => {
			s.classList.toggle("on", i === heroIndex);
		});
		hero.querySelectorAll(".hero__dot").forEach((d, i) => {
			d.classList.toggle("on", i === heroIndex);
		});

		const stage = hero.querySelector("[data-hero-stage]");
		stage.innerHTML = heroSlideBody(heroSlides[heroIndex]);
		bindHeroBody(hero);
		if (user) startHeroRotation();
	}

	function bindHeroBody(hero) {
		const slide = heroSlides[heroIndex];
		const type = mediaType(slide.item);
		hero.querySelector("[data-hero-play]")?.addEventListener("click", () => {
			openPlayer(remember(slide.item, type), type);
		});
		hero.querySelector("[data-hero-info]")?.addEventListener("click", () => {
			openSheet(slide.item, type, slide.details);
		});
		const favBtn = hero.querySelector("[data-hero-fav]");
		favBtn?.addEventListener("click", () => {
			toggleFav(slide.item, type);
			favBtn.classList.toggle("on", isFav(slide.item.id, type));
			renderRow("saved");
		});
	}

	function startHeroRotation() {
		clearInterval(heroTimer);
		if (heroSlides.length < 2) return;
		heroTimer = setInterval(() => showHeroSlide(heroIndex + 1), HERO_INTERVAL);
	}

	function bindHero() {
		const hero = catalogEl.querySelector("[data-hero]");
		if (!hero) return;
		bindHeroBody(hero);
		hero.querySelectorAll("[data-dot]").forEach((dot) => {
			dot.addEventListener("click", () =>
				showHeroSlide(Number(dot.dataset.dot), { user: true })
			);
		});
		hero.addEventListener("mouseenter", () => clearInterval(heroTimer));
		hero.addEventListener("mouseleave", startHeroRotation);
		startHeroRotation();
	}

	/* ── Rendering ──────────────────────────────────────────────── */

	function render() {
		if (loading) {
			catalogEl.innerHTML =
				heroSkeleton() +
				`<div class="rows">${skeletonRow("Trending Movies")}${skeletonRow("Trending Series")}${skeletonRow("Popular Movies")}</div>`;
			return;
		}

		// Search lives entirely in the overlay - the catalog never gets replaced.
		catalogEl.classList.remove("no-hero");
		const savedRow = savedAsRow();
		const html =
			heroHtml() +
			`<div class="rows">` +
			(savedRow ? rowHtml(savedRow) : "") +
			rows.map((row) => rowHtml(row)).join("") +
			`</div>`;
		catalogEl.innerHTML = html;
		bindHero();
		bindCards(catalogEl);
		catalogEl.querySelectorAll("[data-row]").forEach(bindRow);
	}

	/** Re-render just one row in place (used after favouriting). */
	function renderRow(kind) {
		if (kind === "saved" && !searchQuery.trim() && !loading) render();
	}

	function savedAsRow() {
		if (!saved.items.length) return null;
		return {
			label: "Continue Watching",
			type: null,
			items: saved.items.slice(0, 20).map((i) => ({
				id: i.tmdbId,
				title: i.title,
				poster_path: i.poster_path,
				backdrop_path: i.backdrop_path,
				release_date: i.release_date,
				first_air_date: i.first_air_date,
				vote_average: i.vote_average,
				overview: i.overview,
				media_type: i.type,
			})),
		};
	}

	function bindCards(container) {
		// Cached posters are already decoded and fire no load event.
		container.querySelectorAll(".card__img").forEach((img) => {
			if (img.complete) img.classList.add("is-loaded");
		});

		container.querySelectorAll(".card[data-id]").forEach((card) => {
			const id = Number(card.dataset.id);
			const type = card.dataset.type;

			const open = () => {
				const item = lookup(id, type);
				if (!item) return;
				// Picking a result dismisses the search first.
				if (!searchOverlay.hidden) closeSearch();
				openSheet(item, type);
			};

			card.addEventListener("click", (e) => {
				if (e.target.closest("[data-fav]")) return;
				// The hover play button skips straight to the stream.
				if (e.target.closest("[data-play]")) {
					const item = lookup(id, type);
					if (!item) return;
					if (!searchOverlay.hidden) closeSearch();
					openPlayer(item, type);
					return;
				}
				open();
			});
			card.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					open();
				}
			});
			card.querySelector("[data-fav]")?.addEventListener("click", (e) => {
				e.stopPropagation();
				const item = lookup(id, type) || { id, title: "", poster_path: "" };
				toggleFav(item, type);
			});
		});
	}

	function bindRow(section) {
		const track = section.querySelector("[data-track]");
		const prev = section.querySelector("[data-prev]");
		const next = section.querySelector("[data-next]");
		if (!track || !prev || !next) return;

		const sync = () => {
			const max = track.scrollWidth - track.clientWidth;
			prev.classList.toggle("is-off", track.scrollLeft <= 4);
			next.classList.toggle("is-off", track.scrollLeft >= max - 4);
		};

		const page = () => Math.max(280, track.clientWidth * 0.82);
		prev.addEventListener("click", () =>
			track.scrollBy({ left: -page(), behavior: "smooth" })
		);
		next.addEventListener("click", () =>
			track.scrollBy({ left: page(), behavior: "smooth" })
		);
		track.addEventListener("scroll", sync, { passive: true });
		new ResizeObserver(sync).observe(track);
		sync();
	}

	/* ── Details sheet ──────────────────────────────────────────── */

	/** The card that fronts every title before you commit to watching it. */
	async function openSheet(item, type, preloaded) {
		const title = titleOf(item);
		const backdrop = item.backdrop_path
			? img(TMDB_BACKDROP + item.backdrop_path)
			: item.poster_path
				? img(TMDB_BACKDROP + item.poster_path)
				: "";
		const score = scoreOf(item);
		const year = yearOf(item);

		// Paint immediately from what the row already knows, fill in after.
		sheetPanel.innerHTML = `
			<div class="sheet__art" ${backdrop ? `style="background-image:url('${backdrop}')"` : ""}>
				<button type="button" class="sheet__close" data-sheet-close aria-label="Close">${icon("close")}</button>
				<span class="sheet__fade"></span>
			</div>
			<div class="sheet__body">
				<h2>${esc(title)}</h2>
				<div class="sheet__meta">
					${score ? `<span class="hero__score">${icon("star", "lucide--fill")}${score}</span>` : ""}
					${year ? `<span>${year}</span>` : ""}
					<span data-extra-meta></span>
				</div>
				<div class="hero__genres" data-genres hidden></div>
				<p class="sheet__overview" data-overview>${esc(item.overview || "")}</p>
				<div class="sheet__actions">
					<button type="button" class="btn btn--accent" data-sheet-play>${icon("play", "lucide--fill")}<span>Watch</span></button>
					<button type="button" class="sheet__fav${isFav(item.id, type) ? " on" : ""}" data-sheet-fav aria-label="Save to library">${icon("heart")}</button>
				</div>
			</div>`;

		sheetEl.hidden = false;
		setTimeout(() => sheetEl.classList.add("is-open"), 16);

		sheetPanel.querySelector("[data-sheet-play]").addEventListener("click", () => {
			closeSheet();
			openPlayer(remember(item, type), type);
		});
		sheetPanel.querySelector("[data-sheet-fav]").addEventListener("click", (e) => {
			toggleFav(item, type);
			e.currentTarget.classList.toggle("on", isFav(item.id ?? item.tmdbId, type));
		});
		sheetEl.querySelectorAll("[data-sheet-close]").forEach((b) => {
			b.addEventListener("click", closeSheet);
		});

		const details = preloaded || (await fetchDetails(item.id, type));
		if (sheetEl.hidden) return;

		const genres = (details?.genres || []).map((g) => g.name);
		const extras = [];
		extras.push(type === "tv" ? "TV Series" : "Movie");
		if (runtimeOf(details)) extras.push(runtimeOf(details));
		if (details?.number_of_seasons) {
			extras.push(
				`${details.number_of_seasons} season${details.number_of_seasons === 1 ? "" : "s"}`
			);
		}

		const metaSlot = sheetPanel.querySelector("[data-extra-meta]");
		if (metaSlot) {
			metaSlot.outerHTML = extras
				.map((bit, i) =>
					i === 0
						? `<span class="hero__pill">${esc(bit)}</span>`
						: `<span>${esc(bit)}</span>`
				)
				.join("");
		}

		const genreSlot = sheetPanel.querySelector("[data-genres]");
		if (genreSlot && genres.length) {
			genreSlot.hidden = false;
			genreSlot.innerHTML = genres
				.map((g) => `<span class="tag">${esc(g)}</span>`)
				.join("");
		}

		const overview = sheetPanel.querySelector("[data-overview]");
		if (overview) {
			overview.textContent =
				details?.overview || item.overview || "No description available.";
		}

	}

	function closeSheet() {
		sheetEl.classList.remove("is-open");
		setTimeout(() => {
			sheetEl.hidden = true;
		}, 260);
	}

	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && !sheetEl.hidden) closeSheet();
	});

	/* ── Data ───────────────────────────────────────────────────── */

	async function fetchJson(url) {
		const res = await fetch(url);
		const data = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(data.error || `Request failed: ${url}`);
		return data;
	}

	function mountSeasonDropdown(seasons) {
		const list = seasons.length
			? seasons
			: [{ season_number: player?.season || 1, episode_count: 0 }];
		const items = list.map((s) => ({
			id: String(s.season_number),
			label: `Season ${s.season_number}`,
			blurb: s.episode_count
				? `${s.episode_count} episode${s.episode_count === 1 ? "" : "s"}`
				: "",
			icon: "layers",
		}));

		if (seasonDd) {
			seasonDd.setItems(items);
			seasonDd.set(String(player.season));
			return;
		}

		seasonDd = dropdown({
			items,
			value: String(player?.season || items[0].id),
			label: "Season",
			className: "dd--settings dd--season",
			onPick: (id) => {
				if (!player) return;
				player.season = Number(id);
				player.episode = 1;
				loadEpisodes();
				updatePlayer();
			},
		});
		seasonSlot.replaceChildren(seasonDd.el);
	}

	async function fetchDetails(id, type) {
		const k = keyOf(id, type);
		if (detailsCache.has(k)) return detailsCache.get(k);
		try {
			const d = await fetchJson(`/api/tmdb/${type}/${id}`);
			detailsCache.set(k, d);
			return d;
		} catch {
			return null;
		}
	}

	async function buildHero(pool) {
		const picks = pool.filter((i) => i.backdrop_path).slice(0, HERO_COUNT);
		heroSlides = picks.map((item) => ({ item, details: null, logo: null }));

		await Promise.all(
			heroSlides.map(async (slide) => {
				const type = mediaType(slide.item);
				const [details, images] = await Promise.all([
					fetchDetails(slide.item.id, type),
					fetchJson(`/api/tmdb/${type}/${slide.item.id}/images`).catch(() => null),
				]);
				slide.details = details;
				const logos = images?.logos || [];
				const best =
					logos.find((l) => l.iso_639_1 === "en" && l.file_path?.endsWith(".png")) ||
					logos.find((l) => l.iso_639_1 === "en") ||
					logos[0];
				slide.logo = best?.file_path || null;
			})
		);
	}

	async function loadHome() {
		loading = true;
		showError("");
		render();
		updateStats();

		// Wait for the proxy so posters are requested through it from the start.
		await proxyReady;

		const settled = await Promise.allSettled(
			ROW_SOURCES.map((src) => fetchJson(src.url))
		);

		const byKey = {};
		rows = [];
		settled.forEach((res, i) => {
			const src = ROW_SOURCES[i];
			if (res.status !== "fulfilled") return;
			const items = (res.value.results || [])
				.filter((r) => r.poster_path)
				.map((r) => remember(r, src.type));
			if (!items.length) return;
			byKey[src.key] = items;
			rows.push({ label: src.label, type: src.type, items });
		});

		if (!rows.length) {
			const first = settled.find((r) => r.status === "rejected");
			showError(
				first?.reason?.message ||
					"Could not reach TMDB - check TMDB_API_KEY in your .env"
			);
			loading = false;
			catalogEl.innerHTML = `<div class="rows"><p class="media-empty">${icon("popcorn")}Nothing to show yet.</p></div>`;
			updateStats();
			return;
		}

		// A "Recommended" row seeded from whatever the viewer saved last.
		const seed = saved.items[0];
		if (seed) {
			try {
				const rec = await fetchJson(
					`/api/tmdb/${seed.type}/${seed.tmdbId}/recommendations`
				);
				const items = (rec.results || [])
					.filter((r) => r.poster_path)
					.slice(0, 20)
					.map((r) => remember(r, mediaType(r)));
				if (items.length) {
					rows.unshift({
						label: `Because you watched ${seed.title}`,
						type: null,
						items,
					});
				}
			} catch {}
		}

		const heroPool = [
			...(byKey.trendMovie || []).slice(0, 4),
			...(byKey.trendTv || []).slice(0, 4),
		].sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));

		loading = false;
		await buildHero(heroPool);
		render();
		updateStats();
	}

	/* ── Search overlay ─────────────────────────────────────────── */

	function openSearch() {
		searchOverlay.hidden = false;
		setTimeout(() => searchOverlay.classList.add("is-open"), 16);
		setTimeout(() => searchInput.focus(), 120);
		if (!searchQuery.trim()) renderSearchIdle();
	}

	function closeSearch() {
		searchOverlay.classList.remove("is-open");
		setTimeout(() => {
			searchOverlay.hidden = true;
		}, 240);
	}

	function renderSearchIdle() {
		searchResultsEl.innerHTML = `
			<div class="search-idle">
				${icon("search")}
				<strong>Start searching</strong>
				<span>Find movies, TV shows and everything in between</span>
			</div>`;
	}

	function renderSearchSkeleton() {
		searchResultsEl.innerHTML = `<div class="search-grid">${Array.from(
			{ length: 10 },
			() => `<div class="card card--skeleton"><div class="card__art skeleton"></div></div>`
		).join("")}</div>`;
	}

	function renderSearchResults() {
		const list = searchResults.filter(
			(item) => searchFilter === "all" || mediaType(item) === searchFilter
		);

		if (!list.length) {
			searchResultsEl.innerHTML = `
				<div class="search-idle">
					${icon("popcorn")}
					<strong>Nothing found</strong>
					<span>Try a different title or spelling</span>
				</div>`;
			return;
		}

		searchResultsEl.innerHTML = `<div class="search-grid">${list
			.map((item) => cardHtml(item, mediaType(item)))
			.join("")}</div>`;
		bindCards(searchResultsEl);
	}

	async function runSearch() {
		const q = searchQuery.trim();
		if (!q) {
			searchResults = [];
			renderSearchIdle();
			return;
		}

		renderSearchSkeleton();
		try {
			const d = await fetchJson(`/api/tmdb/search?q=${encodeURIComponent(q)}`);
			searchResults = (d.results || [])
				.filter((r) => r.poster_path)
				.map((r) => remember(r, mediaType(r)));
			showError("");
		} catch (e) {
			searchResults = [];
			showError(e.message);
		}
		renderSearchResults();
	}

	/* ── Player ─────────────────────────────────────────────────── */

	/* ── Episodes drawer ────────────────────────────────────────── */

	async function loadEpisodes() {
		if (player?.type !== "tv") {
			episodes = [];
			return;
		}

		const show = await fetchDetails(player.tmdbId, "tv");
		const seasons = (show?.seasons || []).filter((s) => s.season_number > 0);
		mountSeasonDropdown(seasons);

		epList.innerHTML = Array.from(
			{ length: 6 },
			() => `<div class="ep-row ep-row--skeleton"><div class="ep-row__art skeleton"></div>
				<div class="ep-row__meta"><div class="skeleton sk-line"></div><div class="skeleton sk-line sk-line--short"></div></div></div>`
		).join("");

		try {
			const data = await fetchJson(
				`/api/tmdb/tv/${player.tmdbId}/season/${player.season}`
			);
			episodes = data.episodes || [];
		} catch {
			episodes = [];
		}

		renderEpisodes();
	}

	function renderEpisodes() {
		const q = epSearch.value.trim().toLowerCase();
		const list = episodes.filter(
			(ep) =>
				!q ||
				(ep.name || "").toLowerCase().includes(q) ||
				String(ep.episode_number).includes(q)
		);

		drawerTitle.textContent = player?.title || "";
		drawerSub.textContent = `Season ${player?.season}, Episode ${player?.episode}`;

		if (!list.length) {
			epList.innerHTML = `<p class="media-empty">${icon("popcorn")}No episodes found.</p>`;
			return;
		}

		epList.innerHTML = list
			.map(
				(ep) => `
			<button type="button" class="ep-row${ep.episode_number === player.episode ? " is-on" : ""}" data-episode="${ep.episode_number}">
				<span class="ep-row__art">
					${ep.still_path ? `<img src="${img(TMDB_STILL + ep.still_path)}" alt="" loading="lazy" />` : ""}
					<span class="ep-row__num">E${ep.episode_number}</span>
					<span class="ep-row__play">${icon("play", "lucide--fill")}</span>
				</span>
				<span class="ep-row__meta">
					<strong>${esc(ep.name || `Episode ${ep.episode_number}`)}</strong>
					<span>${esc(ep.overview || "No description yet.")}</span>
				</span>
			</button>`
			)
			.join("");

		epList.querySelectorAll("[data-episode]").forEach((btn) => {
			btn.addEventListener("click", () => {
				player.episode = Number(btn.dataset.episode);
				updatePlayer();
				closeDrawer();
			});
		});
	}

	function openDrawer() {
		if (player?.type !== "tv") return;
		drawerEl.hidden = false;
		drawerScrim.hidden = false;
		setTimeout(() => {
			drawerEl.classList.add("is-open");
			drawerScrim.classList.add("is-open");
		}, 16);
		renderEpisodes();
	}

	function closeDrawer() {
		drawerEl.classList.remove("is-open");
		drawerScrim.classList.remove("is-open");
		setTimeout(() => {
			drawerEl.hidden = true;
			drawerScrim.hidden = true;
		}, 280);
	}

	/* ── Server picker ──────────────────────────────────────────── */

	function openServers() {
		const modal = openModal({
			title: "Server",
			subtitle: "Choose a server to stream from. If one stalls, try the next.",
			size: "sm",
			body: `
				<div class="server-list">
					${PROVIDERS.map(
						(p, i) => `
						<button type="button" class="server-row${p.id === providerId ? " is-on" : ""}" data-server="${p.id}">
							<span class="server-row__name">Server ${i + 1}</span>
							${p.id === providerId ? `<span class="server-row__check">${icon("check")}</span>` : ""}
							<span class="server-row__note">${esc(p.label)}</span>
						</button>`
					).join("")}
				</div>
				<p class="server-note">${icon("info")}<span>Servers are third-party - quality and availability vary by title.</span></p>`,
		});

		modal.body.querySelectorAll("[data-server]").forEach((btn) => {
			btn.addEventListener("click", () => {
				providerId = btn.dataset.server;
				modal.close();
				mountStream();
				notify(
					"Server switched",
					PROVIDERS.find((p) => p.id === providerId)?.label || "",
					"success"
				);
			});
		});
	}

	async function mountStream() {
		await ensureScramjet();
		if (!playerFrame) playerFrame = createMediaFrame(iframe);

		const sealFrame = () => {
			try {
				const w = iframe.contentWindow;
				if (w) w.open = () => null;
			} catch {}
		};

		/*
		 * Embeds start muted so autoplay is allowed. The player runs through
		 * the proxy, so it is same-origin: reach in and turn it up once the
		 * <video> exists. Players build it late, hence the sweep.
		 */
		const unmute = () => {
			try {
				const doc = iframe.contentDocument;
				if (!doc) return;
				doc.querySelectorAll("video, audio").forEach((media) => {
					if (media.dataset.riseUnmuted) return;
					media.dataset.riseUnmuted = "1";
					media.muted = false;
					media.volume = 1;
				});
			} catch {}
		};

		iframe.addEventListener("load", sealFrame, { once: false });
		sealFrame();
		if (iframe._sealTimer) clearInterval(iframe._sealTimer);
		const sealTimer = setInterval(() => {
			sealFrame();
			unmute();
		}, 800);

		const prov = PROVIDERS.find((p) => p.id === providerId) || PROVIDERS[0];
		const target =
			player.type === "tv"
				? prov.tv(player.tmdbId, player.season, player.episode)
				: prov.movie(player.tmdbId);
		playerFrame.go(target);

		iframe._sealTimer = sealTimer;
	}

	function renderCrumb() {
		const isTv = player.type === "tv";
		crumbEl.innerHTML = `
			${icon("home")}
			<span>${isTv ? "TV Shows" : "Movies"}</span>
			${icon("right", "crumb__sep")}
			<strong>${esc(player.title)}</strong>
			${isTv ? `<span class="crumb__ep">S${player.season} · E${player.episode}</span>` : ""}`;
	}

	async function updatePlayer() {
		renderCrumb();
		railNext.hidden = player.type !== "tv";
		railEps.hidden = player.type !== "tv";
		if (!drawerEl.hidden) renderEpisodes();
		await mountStream();
	}

	async function openPlayer(item, type) {
		const id = item.id ?? item.tmdbId;
		const savedItem = saved.items.find((i) => i.tmdbId === id && i.type === type);
		player = {
			type,
			tmdbId: id,
			title: titleOf(item),
			season: type === "tv" ? savedItem?.season || 1 : 1,
			episode: type === "tv" ? savedItem?.episode || 1 : 1,
		};
		clearInterval(heroTimer);
		catalogEl.hidden = true;
		topbarEl.hidden = true;
		playerEl.hidden = false;
		blockPopups();
		showChrome();
		window.dispatchEvent(
			new CustomEvent("riseub:xp", { detail: type === "tv" ? "episode" : "movie" })
		);
		await updatePlayer();
		if (player.type === "tv") loadEpisodes();
	}

	function closePlayer() {
		if (player?.type === "tv") {
			saved.items = saved.items.map((i) =>
				i.tmdbId === player.tmdbId && i.type === "tv"
					? { ...i, season: player.season, episode: player.episode }
					: i
			);
			saveSaved(saved);
		}
		player = null;
		playerEl.hidden = true;
		closeDrawer();
		unblockPopups?.();
		// Stop playback - a hidden iframe keeps streaming otherwise.
		try {
			iframe.src = "about:blank";
		} catch {}
		catalogEl.hidden = false;
		topbarEl.hidden = false;
		render();
	}

	/* ── Wiring ─────────────────────────────────────────────────── */

	searchInput.addEventListener("input", () => {
		searchQuery = searchInput.value;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(runSearch, 320);
	});
	searchInput.addEventListener("keydown", (e) => {
		if (e.key === "Escape") closeSearch();
	});

	el.querySelector("[data-search-open]").addEventListener("click", openSearch);
	el.querySelectorAll("[data-search-close]").forEach((btn) => {
		btn.addEventListener("click", closeSearch);
	});
	el.querySelectorAll("[data-filter]").forEach((btn) => {
		btn.addEventListener("click", () => {
			searchFilter = btn.dataset.filter;
			el.querySelectorAll("[data-filter]").forEach((b) =>
				b.classList.toggle("on", b === btn)
			);
			if (searchQuery.trim()) renderSearchResults();
		});
	});

	/* Player chrome shows on movement and hides again after a few still seconds. */
	const stageEl = el.querySelector(".player-stage");
	let chromeTimer = null;

	function showChrome() {
		stageEl.classList.add("show-chrome");
		clearTimeout(chromeTimer);
		chromeTimer = setTimeout(() => {
			stageEl.classList.remove("show-chrome");
		}, 3000);
	}

	el.querySelector("[data-rail-toggle]")?.addEventListener("click", () => {
		stageEl.classList.toggle("rail-off");
		if (!stageEl.classList.contains("rail-off")) showChrome();
	});

	stageEl.addEventListener("pointermove", showChrome);
	stageEl.addEventListener("pointerenter", showChrome);
	stageEl.addEventListener("pointerleave", () => {
		clearTimeout(chromeTimer);
		stageEl.classList.remove("show-chrome");
	});
	stageEl.addEventListener("pointerdown", showChrome);

	el.querySelector("[data-back]").addEventListener("click", closePlayer);
	el.querySelector("[data-servers]").addEventListener("click", openServers);
	railEps.addEventListener("click", openDrawer);
	railNext.addEventListener("click", () => {
		const max = episodes.length || player.episode + 1;
		player.episode = Math.min(max, player.episode + 1);
		updatePlayer();
	});
	el.querySelectorAll("[data-eps-close]").forEach((btn) => {
		btn.addEventListener("click", closeDrawer);
	});
	epSearch.addEventListener("input", renderEpisodes);

	document.addEventListener("keydown", (e) => {
		if (e.key !== "Escape") return;
		if (!searchOverlay.hidden) closeSearch();
		else if (!drawerEl.hidden) closeDrawer();
	});

	loadHome();

	return {
		destroy() {
			clearInterval(heroTimer);
			unblockPopups?.();
			el.remove();
		},
	};
}
