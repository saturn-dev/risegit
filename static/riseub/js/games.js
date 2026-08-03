import { icon } from "./icons.js";
import { notify } from "./toast.js";

const THUMBS = "/storage/images/game-images/thumbnails";
/** Full-size art, used where it's shown big - the loader card. */
const COVERS = "/storage/images/game-images/normal";
/** Portrait art for the Rise Originals row. */
const VERTICAL = "/storage/images/game-images/verticle";
const VOLUME_KEY = "riseub-games-volume";
const RECENT_KEY = "riseub-games-recent";
const FAV_KEY = "riseub-games-fav";
const PAGE = 60;
const MIN_SKELETON = 450;
/** Anti-farm gate on play XP. */
const XP_GATE_KEY = "riseub-games-xp";
const XP_COOLDOWN_MIN = 30000;
const XP_COOLDOWN_MAX = 45000;

/**
 * UGS games are single self-contained .html documents, so a bare `link` is a
 * file name: "cl1on1soccer" → EMBED_BASE + "cl1on1soccer.html".
 *
 * Prefixed `g_…` links pull a folder from saturn-dev/gfiles the same way:
 * "g_crusher_clicker" → GFILES_BASE + "crusher-clicker/index.html".
 * Scripts stay on jsDelivr (correct MIME). Huge Unity `.unityweb` files are
 * rewritten at fetch-time onto GitHub raw - jsDelivr 403s anything over 20MB.
 *
 * Full URLs (https://…) and same-origin paths (/…) are used exactly as given.
 */
const EMBED_BASE = "https://cdn.jsdelivr.net/gh/bubbls/ugs-singlefile/UGS-Files/";
const GFILES_BASE = "https://cdn.jsdelivr.net/gh/saturn-dev/gfiles@main/";
const GFILES_RAW = "https://raw.githubusercontent.com/saturn-dev/gfiles/main/";

/** How long to wait on a game host before calling it dead. */
const BOOT_TIMEOUT = 60000;
/** Artwork is decoration - never let it hold the game up. */
const ART_TIMEOUT = 2500;
/** Asset loading is done once nothing new has arrived for this long. */
const ASSET_QUIET = 1500;
/** …and never watch longer than this, however chatty the game is.
 *  Unity WebGL can pull 50MB+ of .unityweb - give it room. */
const ASSET_MAX = 180000;
/** Lines kept in the asset log. */
const LOG_MAX = 40;

/** Encode each path segment so spaces/parens survive, but keep `/` as `/`. */
function encodePath(path) {
	return String(path)
		.split("/")
		.filter((p, i, arr) => p || i === arr.length - 1)
		.map((seg) => encodeURIComponent(seg))
		.join("/");
}

function embedUrl(link) {
	const raw = String(link || "").trim();
	if (!raw) return "";
	if (/^https?:\/\//i.test(raw) || raw.startsWith("/")) return raw;

	// g_folder → saturn gfiles index.html (same blob + <base> path as UGS).
	// Underscores → hyphens ("g_crusher_clicker" → crusher-clicker/).
	if (/^g_/i.test(raw)) {
		const slug = raw
			.slice(2)
			.replace(/^\/+|\/+$/g, "")
			.replace(/_/g, "-");
		if (!slug) return "";
		const hasFile = /\.[a-z0-9]+$/i.test(slug.split("/").pop() || "");
		const path = hasFile ? slug : `${slug}/index.html`;
		return GFILES_BASE + encodePath(path);
	}

	const name = raw.replace(/^\/+|\/+$/g, "");
	// Names carry spaces, parens and the odd accent - they have to be encoded.
	const file = name.includes(".") && name.lastIndexOf(".") > 0 ? name : `${name}.html`;
	return EMBED_BASE + encodeURIComponent(file);
}

/**
 * Games route audio through WebAudio (Ruffle, Unity) as often as through an
 * <audio> tag, so one volume control means owning `AudioContext.destination`
 * before the game ever reads it: everything it connects lands on our gain node.
 */
const VOLUME_SHIM = `<script>(function(){
	var vol = __V__, gains = [];
	function media(){
		var list = document.querySelectorAll("audio,video");
		for (var i = 0; i < list.length; i++) { try { list[i].volume = vol; } catch (e) {} }
	}
	["AudioContext","webkitAudioContext","BaseAudioContext"].forEach(function(key){
		var Ctor = window[key];
		if (!Ctor || !Ctor.prototype) return;
		// "destination" is declared on BaseAudioContext, not on AudioContext.
		var proto = Ctor.prototype, desc = null;
		while (proto && !desc) {
			desc = Object.getOwnPropertyDescriptor(proto, "destination");
			if (!desc) proto = Object.getPrototypeOf(proto);
		}
		if (!desc || !desc.get || !proto || proto.__risePatched) return;
		proto.__risePatched = true;
		Object.defineProperty(proto, "destination", {
			configurable: true,
			get: function(){
				if (!this.__riseOut) this.__riseOut = desc.get.call(this);
				if (!this.__riseGain) {
					try {
						var g = this.createGain();
						g.gain.value = vol;
						g.connect(this.__riseOut);
						this.__riseGain = g;
						gains.push(g);
					} catch (e) { return this.__riseOut; }
				}
				return this.__riseGain;
			}
		});
	});
	Object.defineProperty(window, "__riseVolume", {
		configurable: true,
		get: function(){ return vol; },
		set: function(next){
			vol = Math.max(0, Math.min(1, Number(next) || 0));
			for (var i = 0; i < gains.length; i++) { try { gains[i].gain.value = vol; } catch (e) {} }
			media();
		}
	});
	setInterval(media, 1000);
})();<\/script>`;

/** Normalize a base href into a directory URL (trailing slash). */
function assetFolder(href, fallbackFileUrl) {
	let folder = String(href || "").trim();
	if (!folder) folder = String(fallbackFileUrl || "").replace(/[^/]+$/, "");
	if (/\.html?$/i.test(folder) || /\.php$/i.test(folder)) {
		folder = folder.replace(/[^/]+$/, "");
	}
	if (folder && !folder.endsWith("/")) folder += "/";
	return folder;
}

/**
 * Construct (and similar) call `new URL(path, location.href)`. blob: is not a
 * valid URL base, so remap blob:/about: bases onto the game's CDN folder.
 * Root-absolute paths (`/webapp/…`) are rewritten onto that folder too -
 * otherwise they hit localhost from a blob: document.
 *
 * Unity builds also pull multi‑MB `.unityweb` files; jsDelivr 403s those, so
 * XHR/fetch for those assets is pointed at GitHub raw instead.
 */
function blobCompatPatch(folder) {
	const base = JSON.stringify(folder);
	const rawRoot = JSON.stringify(GFILES_RAW);
	return `<script>(function(){
	var BASE=${base};
	var RAW=${rawRoot};
	if(!BASE)return;
	var NativeURL=window.URL;
	function fixBase(b){
		if(b==null)return BASE;
		var s=String(b);
		if(!s||s==="undefined"||s.slice(0,5)==="blob:"||s.slice(0,6)==="about:"||s==="http://"||s==="https://")
			return BASE;
		return b;
	}
	function RiseURL(url, base){
		var u=String(url), b=fixBase(arguments.length>=2?base:BASE);
		// /webapp/foo against blob origin → localhost; pin to the CDN folder.
		if(u.charAt(0)==="/"&&u.charAt(1)!=="/"){
			try{return new NativeURL(u.slice(1), b);}catch(e){}
		}
		if(arguments.length>=2)return new NativeURL(url, b);
		try{return new NativeURL(url);}catch(e){return new NativeURL(url, BASE);}
	}
	RiseURL.prototype=NativeURL.prototype;
	RiseURL.createObjectURL=NativeURL.createObjectURL.bind(NativeURL);
	RiseURL.revokeObjectURL=NativeURL.revokeObjectURL.bind(NativeURL);
	if(NativeURL.canParse)RiseURL.canParse=NativeURL.canParse.bind(NativeURL);
	if(NativeURL.parse)RiseURL.parse=NativeURL.parse.bind(NativeURL);
	window.URL=RiseURL;
	var NativeWorker=window.Worker;
	window.Worker=function(scriptURL, options){
		var abs=String(scriptURL);
		try{abs=new RiseURL(scriptURL, BASE).href;}catch(e){}
		return new NativeWorker(abs, options);
	};
	window.Worker.prototype=NativeWorker.prototype;

	// jsDelivr refuses files >20MB ("File size exceeded…"). Unity .unityweb
	// builds are often 25–30MB - pull those from GitHub raw instead.
	function rewriteLarge(url){
		var s=String(url||"");
		var m=s.match(/^https:\\/\\/cdn\\.jsdelivr\\.net\\/gh\\/saturn-dev\\/gfiles@[^/]+\\/(.+)$/i);
		if(!m)return s;
		var path=m[1].split("?")[0];
		if(/\\.(unityweb|data|wasm|bundle)(\\?|$)/i.test(path)||/(^|\\/)Build\\//i.test(path))
			return RAW+m[1];
		return s;
	}
	var _fetch=window.fetch;
	window.fetch=function(input, init){
		try{
			if(typeof input==="string") input=rewriteLarge(input);
			else if(input&&typeof input.url==="string")
				input=new Request(rewriteLarge(input.url), input);
		}catch(e){}
		return _fetch.call(this, input, init);
	};
	var _open=XMLHttpRequest.prototype.open;
	XMLHttpRequest.prototype.open=function(method, url){
		try{if(typeof url==="string") arguments[1]=rewriteLarge(url);}catch(e){}
		return _open.apply(this, arguments);
	};

	var RI;
	Object.defineProperty(window,"RuntimeInterface",{
		configurable:true,enumerable:true,
		get:function(){return RI},
		set:function(v){
			RI=v;
			if(!v||!v.prototype||v.__riseBase)return;
			v.__riseBase=1;
			var init=v.prototype._Init;
			if(typeof init==="function"){
				v.prototype._Init=function(e){
					e=e||{};
					e.runtimeBaseUrl=BASE;
					return init.call(this,e);
				};
			}
		}
	});
})();<\/script>`;
}

/**
 * Blob documents need a CDN <base> for relative assets. UGS files already ship
 * the correct one (often UGS-Assets/…, not UGS-Files/) - never overwrite it.
 */
function prepareDoc(html, url, volume) {
	let doc = html;
	const existing = doc.match(
		/<base\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/i
	);
	const folder = assetFolder(existing?.[1], url);

	if (!existing) {
		const baseTag = `<base href="${folder.replace(/"/g, "&quot;")}">`;
		if (/<head[^>]*>/i.test(doc)) {
			doc = doc.replace(/<head[^>]*>/i, (open) => open + baseTag);
		} else {
			doc = baseTag + doc;
		}
	}

	// Offline SW against a blob: document just fights the cache - drop it.
	doc = doc.replace(/<script[^>]*offlineclient\.js[^>]*><\/script>/gi, "");

	// Rewrite root-absolute asset URLs in markup so <script src="/webapp/…">
	// doesn't resolve to localhost from the blob document.
	if (folder) {
		doc = doc.replace(
			/\b(src|href)=(["'])\/(?!\/)([^"']+)\2/gi,
			(_, attr, q, path) => `${attr}=${q}${folder}${path}${q}`
		);
	}

	const inject =
		blobCompatPatch(folder) + VOLUME_SHIM.replace("__V__", () => String(volume));
	return /<head[^>]*>/i.test(doc)
		? doc.replace(/<head[^>]*>/i, (open) => open + inject)
		: inject + doc;
}

/** Last path segment, or the host when there's no real file name to show. */
function assetLabel(url) {
	try {
		const { hostname, pathname } = new URL(url);
		const file = decodeURIComponent(pathname.split("/").filter(Boolean).pop() || "");
		return file.includes(".") ? file : hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

function fmtBytes(n) {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
	return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Titles shown with the house placeholder treatment rather than a thumbnail.
 * Mid-tier picks so the row isn't a copy of Top picks.
 */
const RISE_ORIGINALS = [
	"shell-shockers",
	"drive-mad",
	"crusher-clicker",
	"idle-breakout",
	"basketball-stars",
	"gladihoppers",
	"getaway-shootout",
	"jack-smith",
	"moto-x3m",
	"bossy-toss",
	"computer-bashing",
	"murder",
];

/** Row plan, top to bottom. `from` picks the slice out of the data. */
const ROWS = [
	{ id: "recent", label: "Continue playing", kind: "recent" },
	{ id: "favourites", label: "Your library", kind: "favourites" },
	{ id: "top", label: "Top picks for you", kind: "feature", from: ["games", 0, 9] },
	{ id: "featured", label: "Featured games", from: ["games", 9, 27] },
	{ id: "new", label: "New games", from: ["games", 27, 45] },
	{ id: "originals", label: "Rise Originals", kind: "originals" },
	{ id: "trending", label: "Trending now", from: ["games", 45, 63] },
	{ id: "fnf", label: "Friday Night Funkin'", from: ["fnfGames", 0, 99] },
	{ id: "papas", label: "Papa's kitchen", from: ["papasGames", 0, 99] },
	{ id: "gba", label: "Game Boy Advance", from: ["gbaGames", 0, 99] },
	{ id: "flash", label: "Flash classics", from: ["flashGames", 0, 99] },
	{ id: "more", label: "More to play", from: ["games", 63, 99] },
];

function esc(s) {
	const d = document.createElement("div");
	d.textContent = s == null ? "" : s;
	return d.innerHTML;
}

/** Same rule the thumbnails are named with. */
function slugify(name) {
	return String(name || "")
		.toLowerCase()
		.replace(/['’]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * games.json only carries `name`, `author` and `link` - the slug is derived
 * from the name and the order in the file *is* the ranking, so adding a game
 * never means renumbering anything.
 */
function normalise(raw) {
	const out = {};
	for (const [key, list] of Object.entries(raw || {})) {
		if (!Array.isArray(list)) continue;
		out[key] = list
			.filter((g) => g && typeof g === "object" && g.name)
			.map((g) => ({
				slug: slugify(g.name),
				name: String(g.name),
				author: g.author || "",
				link: typeof g.link === "string" ? g.link : "",
			}));
	}
	return out;
}


function loadValue(key) {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function loadVolume() {
	// Guard the empty case first: Number(null) is 0, which reads as a valid
	// level and would silently start every new install muted.
	const raw = loadValue(VOLUME_KEY);
	if (raw === null || raw === "") return 1;
	const value = Number(raw);
	return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 1;
}

function loadList(key) {
	try {
		const raw = localStorage.getItem(key);
		if (raw) return JSON.parse(raw);
	} catch {}
	return [];
}

function saveList(key, list) {
	try {
		localStorage.setItem(key, JSON.stringify(list.slice(0, 40)));
	} catch {}
}

export function initGames(root, { ensureScramjet, createMediaFrame } = {}) {
	let data = {};
	let all = [];
	let bySlug = new Map();
	let mode = "home";
	let query = "";
	let category = "all";
	let searchFilter = "all";
	let shown = PAGE;
	let searchTimer = null;
	let playing = null;
	let gameFrame = null;
	let recent = loadList(RECENT_KEY);
	let favs = loadList(FAV_KEY);
	let volume = loadVolume();
	let lastVolume = volume || 1;

	const el = document.createElement("div");
	el.className = "media-page games-page";
	el.innerHTML = `
		<header class="gm-top" data-topbar>
			<div class="gm-brand">
				${icon("gamepad")}
				<div>
					<h1>Games</h1>
					<p data-stats>Loading…</p>
				</div>
			</div>
			<button type="button" class="media-search-btn" data-search-open aria-label="Search">
				${icon("search")}
			</button>
		</header>

		<div class="media-alert" data-error hidden></div>

		<div class="media-content gm-body" data-catalog></div>

		<div class="search-overlay" data-search-overlay hidden>
			<div class="search-overlay__scrim" data-search-close></div>
			<div class="search-overlay__panel" role="dialog" aria-modal="true" aria-label="Search games">
				<div class="search-overlay__bar">
					<div class="search-overlay__field">
						${icon("search")}
						<input type="search" placeholder="Search games…" data-search aria-label="Search games" />
					</div>
					<button type="button" class="search-overlay__x" data-search-close aria-label="Close">${icon("close")}</button>
				</div>
				<p class="search-overlay__hint">Search the whole library - every collection, every title</p>
				<div class="search-overlay__filters" data-search-filters></div>
				<div class="search-overlay__results" data-search-results></div>
			</div>
		</div>

		<div class="gm-player" data-player hidden>
			<div class="game-stage" data-stage>
				<iframe data-game-frame title="Game"
					allow="autoplay; fullscreen; gamepad; clipboard-read; clipboard-write"
					sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups-to-escape-sandbox"></iframe>

				<div class="gm-blank" data-blank hidden>
					<span class="gm-blank__icon">${icon("gamepad")}</span>
					<h2 data-blank-title></h2>
					<p>No link on this one yet. Drop a URL into <code>games.json</code> and it'll load right here.</p>
				</div>

				<div class="gm-load" data-load hidden>
					<div class="gm-load__inner">
						<div class="gm-load__head">
							<span class="gm-load__art"><img alt="" data-load-img hidden /></span>
							<span class="gm-load__id">
								<h2 data-load-title></h2>
								<p data-load-by></p>
							</span>
						</div>

						<div class="gm-load__bar" data-load-bar>
							<span class="gm-load__fill" data-load-fill></span>
						</div>
						<div class="gm-load__meta">
							<span data-load-status>Preparing…</span>
							<b data-load-pct>0%</b>
						</div>

						<ul class="gm-load__log" data-load-log></ul>

						<p class="gm-load__err" data-load-err hidden></p>
						<div class="gm-load__acts">
							<button type="button" class="gm-load__retry" data-load-retry hidden>${icon("rotate")}Try again</button>
							<button type="button" class="gm-load__cancel" data-load-cancel>Back to library</button>
						</div>
					</div>
				</div>

				<nav class="player-rail" aria-label="Game controls">
					<button type="button" class="rail-btn" data-back data-label="Library">${icon("arrowLeft")}</button>
					<button type="button" class="rail-btn" data-reload data-label="Restart">${icon("rotate")}</button>
					<div class="rail-vol" data-vol-wrap>
						<button type="button" class="rail-btn" data-vol-btn data-label="Volume">${icon("volume")}</button>
						<div class="rail-vol__pop">
							<input type="range" min="0" max="100" step="1" value="100" data-vol
								aria-label="Game volume" />
							<span data-vol-read>100</span>
						</div>
					</div>
					<button type="button" class="rail-btn" data-fav data-label="Save">${icon("heart")}</button>
					<span class="rail-sep"></span>
					<button type="button" class="rail-btn" data-full data-label="Fullscreen">${icon("fullscreen")}</button>
				</nav>
				<button type="button" class="rail-hide" data-rail-toggle aria-label="Toggle controls">${icon("chevronRight")}</button>
				<div class="player-crumb" data-crumb></div>
			</div>
		</div>`;
	root.appendChild(el);

	const statsEl = el.querySelector("[data-stats]");
	const errorEl = el.querySelector("[data-error]");
	const catalogEl = el.querySelector("[data-catalog]");
	const topbarEl = el.querySelector("[data-topbar]");
	const searchInput = el.querySelector("[data-search]");
	const searchOverlay = el.querySelector("[data-search-overlay]");
	const searchFiltersEl = el.querySelector("[data-search-filters]");
	const searchResultsEl = el.querySelector("[data-search-results]");
	const playerEl = el.querySelector("[data-player]");
	const stageEl = el.querySelector("[data-stage]");
	const frameEl = el.querySelector("[data-game-frame]");
	const blankEl = el.querySelector("[data-blank]");
	const crumbEl = el.querySelector("[data-crumb]");
	const loadEl = el.querySelector("[data-load]");
	const loadImg = el.querySelector("[data-load-img]");
	const loadTitle = el.querySelector("[data-load-title]");
	const loadBy = el.querySelector("[data-load-by]");
	const loadBar = el.querySelector("[data-load-bar]");
	const loadFill = el.querySelector("[data-load-fill]");
	const loadStatus = el.querySelector("[data-load-status]");
	const loadPct = el.querySelector("[data-load-pct]");
	const loadLog = el.querySelector("[data-load-log]");
	const loadErr = el.querySelector("[data-load-err]");
	const loadRetry = el.querySelector("[data-load-retry]");
	// Tiles carry [data-fav] too, so the rail's own button has to be scoped.
	const railFav = playerEl.querySelector("[data-fav]");
	const volBtn = el.querySelector("[data-vol-btn]");
	const volInput = el.querySelector("[data-vol]");
	const volRead = el.querySelector("[data-vol-read]");

	const isFav = (slug) => favs.includes(slug);

	/* ── Tiles ──────────────────────────────────────────────────── */

	/** `poster` tiles are Rise Originals - portrait art from /verticle. */
	function tile(game, { big = false, poster = false, eager = false } = {}) {
		// The first block is on screen immediately - don't make it wait for the
		// lazy-load observer.
		const src = `${poster ? VERTICAL : THUMBS}/${esc(game.slug)}.png`;

		return `
			<article class="gm-tile${big ? " gm-tile--big" : ""}" data-game="${esc(game.slug)}"
				tabindex="0" role="button" aria-label="${esc(game.name)}">
				<div class="gm-tile__art is-loading">
					<img src="${src}" alt="" decoding="async"
						loading="${eager ? "eager" : "lazy"}" fetchpriority="${eager ? "high" : "auto"}"
						onerror="this.closest('.gm-tile__art').classList.add('is-blank');this.remove()" />
					<span class="gm-tile__fade"></span>
					<span class="gm-tile__play">${icon("play", "lucide--fill")}</span>
					<button type="button" class="gm-tile__fav${isFav(game.slug) ? " on" : ""}"
						data-fav aria-label="Save">${icon("heart")}</button>
					<div class="gm-tile__cap"><h3>${esc(game.name)}</h3></div>
				</div>
			</article>`;
	}

	function skeletonTiles(n) {
		return Array.from(
			{ length: n },
			() =>
				`<article class="gm-tile gm-tile--skeleton"><div class="gm-tile__art skeleton"></div></article>`
		).join("");
	}

	/**
	 * Real row headings from the start, so nothing shifts when the library
	 * lands - the same trick the movie rows use.
	 */
	function skeletonHome() {
		const rows = ROWS.filter(
			(r) => r.kind !== "recent" && r.kind !== "favourites"
		).slice(0, 5);

		return `<div class="gm-home">${rows
			.map((row) => {
				if (row.kind === "feature") {
					return `
						<section class="gm-row">
							<header class="gm-row__head"><h2>${esc(row.label)}</h2></header>
							<div class="gm-feature">
								<article class="gm-tile gm-tile--big gm-tile--skeleton">
									<div class="gm-tile__art skeleton"></div>
								</article>
								<div class="gm-feature__grid">${skeletonTiles(8)}</div>
							</div>
						</section>`;
				}
				return `
					<section class="gm-row${row.kind === "originals" ? " gm-row--posters" : ""}">
						<header class="gm-row__head"><h2>${esc(row.label)}</h2></header>
						<div class="gm-rail"><div class="gm-track">${skeletonTiles(8)}</div></div>
					</section>`;
			})
			.join("")}</div>`;
	}

	/* ── Data slicing ───────────────────────────────────────────── */

	function slice(from) {
		const [list, start, end] = from;
		return (data[list] || []).slice(start, end);
	}

	function rowItems(row) {
		if (row.kind === "recent") {
			return recent.map((s) => bySlug.get(s)).filter(Boolean);
		}
		if (row.kind === "favourites") {
			return favs.map((s) => bySlug.get(s)).filter(Boolean);
		}
		if (row.kind === "originals") {
			return RISE_ORIGINALS.map((s) => bySlug.get(s)).filter(Boolean);
		}
		return slice(row.from);
	}

	function categories() {
		return [
			{ id: "all", label: "All games", count: all.length },
			{ id: "games", label: "Popular", count: (data.games || []).length },
			{ id: "fnfGames", label: "Funkin'", count: (data.fnfGames || []).length },
			{ id: "papasGames", label: "Papa's", count: (data.papasGames || []).length },
			{ id: "gbaGames", label: "GBA", count: (data.gbaGames || []).length },
			{ id: "flashGames", label: "Flash", count: (data.flashGames || []).length },
		].filter((c) => c.count > 0);
	}

	function filtered() {
		if (category === "all") return all;
		if (category === "favourites") {
			return favs.map((s) => bySlug.get(s)).filter(Boolean);
		}
		return data[category] || [];
	}

	/** Overlay search - name or author, scoped by the active filter chip. */
	function searchList() {
		const q = query.trim().toLowerCase();
		if (!q) return [];
		const pool = searchFilter === "all" ? all : data[searchFilter] || [];
		return pool
			.filter(
				(g) =>
					g.name.toLowerCase().includes(q) ||
					(g.author || "").toLowerCase().includes(q)
			)
			.slice(0, 60);
	}

	/* ── Views ──────────────────────────────────────────────────── */

	function renderHome() {
		const sections = ROWS.map((row) => {
			const items = rowItems(row);
			const floor = row.kind === "recent" || row.kind === "favourites" ? 1 : 5;
			if (items.length < floor) return "";

			const poster = row.kind === "originals";

			if (row.kind === "feature") {
				const [hero, ...rest] = items;
				return `
					<section class="gm-row">
						<header class="gm-row__head"><h2>${esc(row.label)}</h2></header>
						<div class="gm-feature">
							${tile(hero, { big: true, eager: true })}
							<div class="gm-feature__grid">
								${rest.slice(0, 8).map((g) => tile(g, { eager: true })).join("")}
							</div>
						</div>
					</section>`;
			}

			return `
				<section class="gm-row${poster ? " gm-row--posters" : ""}">
					<header class="gm-row__head">
						<h2>${esc(row.label)}</h2>
						<button type="button" class="gm-row__all" data-all="${esc(row.id)}">
							See all${icon("chevronRight")}
						</button>
					</header>
					<div class="gm-rail">
						<button type="button" class="gm-arrow gm-arrow--prev" data-scroll="-1" aria-label="Scroll left">${icon("chevronLeft")}</button>
						<div class="gm-track" data-track>${items.map((g) => tile(g, { poster })).join("")}</div>
						<button type="button" class="gm-arrow gm-arrow--next" data-scroll="1" aria-label="Scroll right">${icon("chevronRight")}</button>
					</div>
				</section>`;
		}).join("");

		catalogEl.innerHTML = `<div class="gm-home">${sections}</div>`;
		bindTiles();
		bindRails();
		syncPosterWidthSoon();
		sweepLoaded(catalogEl);

		catalogEl.querySelectorAll("[data-all]").forEach((btn) => {
			btn.addEventListener("click", () => {
				const row = ROWS.find((r) => r.id === btn.dataset.all);
				category =
					row?.kind === "favourites"
						? "favourites"
						: row?.from
							? row.from[0]
							: "all";
				mode = "browse";
				shown = PAGE;
				render();
				catalogEl.scrollTo({ top: 0, behavior: "smooth" });
			});
		});
	}

	function renderBrowse() {
		const list = filtered();
		const chips = categories();

		catalogEl.innerHTML = `
			<div class="gm-browse">
				<div class="gm-chips">
					<button type="button" class="gm-chip" data-home>${icon("arrowLeft")}Home</button>
					${
						favs.length
							? `<button type="button" class="gm-chip${category === "favourites" ? " on" : ""}" data-cat="favourites">Saved</button>`
							: ""
					}
					${chips
						.map(
							(c) =>
								`<button type="button" class="gm-chip${category === c.id ? " on" : ""}" data-cat="${c.id}">${esc(c.label)}<em>${c.count}</em></button>`
						)
						.join("")}
				</div>

				${
					list.length
						? `<div class="gm-grid">${list.slice(0, shown).map((g) => tile(g)).join("")}</div>`
						: `<p class="media-empty">${icon("gamepad")}Nothing matches that.</p>`
				}

				${
					shown < list.length
						? `<div class="gm-more"><button type="button" class="btn-line" data-more>Show more</button></div>`
						: ""
				}
			</div>`;

		bindTiles();
		sweepLoaded(catalogEl);

		catalogEl.querySelector("[data-home]")?.addEventListener("click", () => {
			mode = "home";
			category = "all";
			render();
		});
		catalogEl.querySelectorAll("[data-cat]").forEach((btn) => {
			btn.addEventListener("click", () => {
				category = btn.dataset.cat;
				shown = PAGE;
				render();
			});
		});
		catalogEl.querySelector("[data-more]")?.addEventListener("click", () => {
			shown += PAGE;
			render();
		});
	}

	function render() {
		if (mode === "home") renderHome();
		else renderBrowse();
		statsEl.textContent = `${all.length} games${favs.length ? ` · ${favs.length} saved` : ""}`;
	}

	function bindTiles(scope = catalogEl) {
		scope.querySelectorAll("[data-game]").forEach((node) => {
			const game = bySlug.get(node.dataset.game);
			node.addEventListener("click", (e) => {
				if (e.target.closest("[data-fav]")) return;
				openGame(game);
			});
			node.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					openGame(game);
				}
			});
			node.querySelector("[data-fav]")?.addEventListener("click", (e) => {
				e.stopPropagation();
				favs = isFav(game.slug)
					? favs.filter((s) => s !== game.slug)
					: [game.slug, ...favs];
				saveList(FAV_KEY, favs);
				e.currentTarget.classList.toggle("on", isFav(game.slug));
				statsEl.textContent = `${all.length} games · ${favs.length} saved`;
			});
		});
	}

	/**
	 * The Top-picks grid is fr-based, so its tile width can only be measured.
	 * Poster rows borrow it verbatim to keep every column on the same rhythm.
	 */
	function syncPosterWidth() {
		const ref = catalogEl.querySelector(".gm-feature__grid .gm-tile__art");
		const tracks = catalogEl.querySelectorAll(".gm-row--posters .gm-track");
		if (!ref || !tracks.length) return false;
		const width = Math.round(ref.getBoundingClientRect().width);
		if (width < 60) return false;
		tracks.forEach((t) => t.style.setProperty("--col", `${width}px`));
		// The columns just changed size - the arrows were measured against the old ones.
		syncRails();
		return true;
	}

	/** Straight after a render the grid can still measure 0 - try again once. */
	function syncPosterWidthSoon() {
		if (!syncPosterWidth()) setTimeout(syncPosterWidth, 60);
	}

	/** Every rail's arrow-state updater, so a relayout can refresh them all. */
	let railSyncs = [];

	function syncRails() {
		railSyncs.forEach((fn) => fn());
	}

	function bindRails() {
		railSyncs = [];

		catalogEl.querySelectorAll(".gm-rail").forEach((rail) => {
			const track = rail.querySelector("[data-track]");
			const prev = rail.querySelector('[data-scroll="-1"]');
			const next = rail.querySelector('[data-scroll="1"]');
			if (!track || !prev || !next) return;

			const sync = () => {
				const max = track.scrollWidth - track.clientWidth - 4;
				prev.classList.toggle("is-off", track.scrollLeft <= 4);
				next.classList.toggle("is-off", track.scrollLeft >= max);
			};

			rail.querySelectorAll("[data-scroll]").forEach((btn) => {
				btn.addEventListener("click", () => {
					track.scrollBy({
						left: Number(btn.dataset.scroll) * track.clientWidth * 0.9,
						behavior: "smooth",
					});
				});
			});

			track.addEventListener("scroll", sync, { passive: true });

			/*
			 * Poster columns are measured and rewritten after this runs, and any
			 * row reflows on resize. Watching the track alone isn't enough: a
			 * --col change moves scrollWidth while clientWidth holds still, so
			 * the first tile has to be watched too.
			 */
			const observer = new ResizeObserver(sync);
			observer.observe(track);
			if (track.firstElementChild) observer.observe(track.firstElementChild);

			railSyncs.push(sync);
			sync();
		});
	}

	/* ── Player ─────────────────────────────────────────────────── */

	let chromeTimer = null;

	function showChrome() {
		stageEl.classList.add("show-chrome");
		clearTimeout(chromeTimer);
		chromeTimer = setTimeout(() => stageEl.classList.remove("show-chrome"), 3000);
	}

	/** Reveal rail + crumb once the loader is gone (entrance animation). */
	function revealChrome() {
		stageEl.classList.remove("is-loading");
		stageEl.classList.remove("chrome-reveal");
		void stageEl.offsetWidth;
		stageEl.classList.add("chrome-reveal");
		showChrome();
	}

	/* ── Asset loader ───────────────────────────────────────────── */

	/** Bumped on every open/close so a stale load can't touch the UI. */
	let loadToken = 0;
	let elapsedTimer = null;
	/** The blob backing the running game - one per game, revoked on swap. */
	let frameBlob = "";

	/** A game document can be several MB; don't leave them pinned in memory. */
	function releaseFrame() {
		if (!frameBlob) return;
		URL.revokeObjectURL(frameBlob);
		frameBlob = "";
	}

	function setProgress(pct, status) {
		const value = Math.max(0, Math.min(100, pct));
		loadBar.classList.remove("is-working");
		// Sweep animation leaves a transform that would clip a 100% fill.
		loadFill.style.removeProperty("transform");
		loadFill.style.removeProperty("animation");
		loadFill.style.width = `${value}%`;
		loadPct.hidden = false;
		loadPct.textContent = `${Math.round(value)}%`;
		if (status) loadStatus.textContent = status;
	}

	/** For the asset phase, where there's no total to measure against. */
	function setWorking(status) {
		loadBar.classList.add("is-working");
		loadPct.hidden = true;
		if (status) loadStatus.textContent = status;
	}

	/** One line per asset the game actually pulled down. */
	function logAsset(name, size) {
		const li = document.createElement("li");
		li.innerHTML = `<span>${esc(name)}</span><em>${size ? esc(fmtBytes(size)) : ""}</em>`;
		loadLog.appendChild(li);
		while (loadLog.children.length > LOG_MAX) loadLog.firstElementChild.remove();
		loadLog.scrollTop = loadLog.scrollHeight;
	}

	/**
	 * The game runs same-origin (blob:), so its own resource timeline is
	 * readable - these are the files it really fetched, not a scripted list.
	 * Resolves once nothing new has arrived for ASSET_QUIET.
	 */
	function watchAssets(token) {
		return new Promise((resolve) => {
			const win = frameEl.contentWindow;
			const seen = new Set();
			let count = 0;
			let bytes = 0;
			let lastAt = performance.now();
			let observer = null;

			const take = (entries) => {
				for (const entry of entries) {
					if (seen.has(entry.name)) continue;
					seen.add(entry.name);
					const size = entry.transferSize || entry.encodedBodySize || 0;
					count++;
					bytes += size;
					lastAt = performance.now();
					logAsset(assetLabel(entry.name), size);
					setWorking(`Loading assets - ${count} files · ${fmtBytes(bytes)}`);
				}
			};

			const stop = () => {
				clearInterval(poll);
				clearTimeout(cap);
				try {
					observer?.disconnect();
				} catch {}
				resolve({ count, bytes });
			};

			try {
				take(win.performance.getEntriesByType("resource"));
				observer = new win.PerformanceObserver((list) => take(list.getEntries()));
				observer.observe({ type: "resource", buffered: true });
			} catch {
				// Nothing readable - fall through to the quiet timeout.
			}

			const poll = setInterval(() => {
				if (token !== loadToken) return stop();
				try {
					take(frameEl.contentWindow.performance.getEntriesByType("resource"));
				} catch {}
				if (performance.now() - lastAt > ASSET_QUIET) stop();
			}, 180);

			const cap = setTimeout(stop, ASSET_MAX);
		});
	}

	function showLoader(game) {
		loadErr.hidden = true;
		loadRetry.hidden = true;
		loadTitle.textContent = game.name;
		loadBy.textContent = game.author || "Unknown studio";
		loadImg.hidden = true;
		loadImg.removeAttribute("src");
		loadLog.innerHTML = "";
		loadEl.classList.remove("is-failed");
		stageEl.classList.add("is-loading");
		stageEl.classList.remove("chrome-reveal", "show-chrome");
		setProgress(0, "Preparing…");
		loadEl.hidden = false;
		// rAF never fires while this pane is occluded - use a timer.
		setTimeout(() => loadEl.classList.add("is-open"), 16);
	}

	function hideLoader() {
		loadEl.classList.remove("is-open");
		clearInterval(elapsedTimer);
		setProgress(100, loadStatus.textContent || "Ready");
		revealChrome();
		setTimeout(() => {
			loadEl.hidden = true;
		}, 320);
	}

	function failLoader(message) {
		clearInterval(elapsedTimer);
		loadEl.classList.add("is-failed");
		loadErr.hidden = false;
		loadErr.textContent = message;
		loadRetry.hidden = false;
		loadStatus.textContent = "Couldn't start";
	}

	/**
	 * Remote pages go through Scramjet instead of being fetched and re-served:
	 * they need their own origin for cookies, storage and same-site requests.
	 * The proxy serves them from us, so the asset timeline is still readable.
	 */
	async function loadProxied(game, url, token) {
		// Usually already warm from boot, so this is a no-op rather than a wait.
		setWorking("Connecting");
		try {
			await ensureScramjet();
			if (token !== loadToken) return;
			if (!gameFrame) gameFrame = createMediaFrame(frameEl);

			await new Promise((resolve, reject) => {
				const done = (fn, arg) => {
					clearTimeout(timer);
					frameEl.removeEventListener("load", onLoad);
					fn(arg);
				};
				const onLoad = () => done(resolve);
				const timer = setTimeout(
					() => done(reject, new Error("the page took too long")),
					BOOT_TIMEOUT
				);
				frameEl.addEventListener("load", onLoad);
				gameFrame.go(url);
			});
		} catch (e) {
			if (token !== loadToken) return;
			failLoader(`Couldn't load ${game.name} - ${e.message}.`);
			return;
		}
		if (token !== loadToken) return;

		const { count, bytes } = await watchAssets(token);
		if (token !== loadToken) return;
		setProgress(100, count ? `Ready - ${count} files · ${fmtBytes(bytes)}` : "Ready");
		setTimeout(() => {
			if (token !== loadToken) return;
			hideLoader();
		}, 520);
	}

	/**
	 * Every phase waits on a real signal: the artwork loading, the document's
	 * bytes arriving, the frame's own load event, and then the game's actual
	 * resource timeline. Nothing here is a timer pretending to be progress.
	 */
	async function loadGame(game, url, token) {
		showLoader(game);

		// 1. Artwork - a real load, capped so a slow image can never hold the
		// game up. (decode() can hang indefinitely in a backgrounded tab.)
		setProgress(4, "Fetching artwork");
		const src = `${COVERS}/${game.slug}.png`;
		const gotArt = await new Promise((resolve) => {
			const img = new Image();
			const finish = (ok) => {
				clearTimeout(cap);
				resolve(ok);
			};
			const cap = setTimeout(() => finish(false), ART_TIMEOUT);
			img.onload = () => finish(true);
			img.onerror = () => finish(false);
			img.src = src;
		});
		if (token !== loadToken) return;
		if (gotArt) {
			loadImg.src = src;
			loadImg.hidden = false;
		}
		setProgress(10, "Contacting the game host");

		// A full URL is somebody else's page, not a UGS / gfiles drop: send it
		// through the proxy so it can set its own cookies and headers.
		if (/^https?:\/\//i.test(String(game.link).trim())) {
			return loadProxied(game, url, token);
		}

		// 2. Files - we download the document ourselves, which gives real byte
		// counts and is required anyway: the CDN serves these as text/plain, so
		// pointing the frame straight at the URL would show source, not a game.
		let blobUrl = "";
		try {
			const res = await fetch(url, { credentials: "omit" });
			if (!res.ok) throw new Error(`the host answered ${res.status}`);
			const total = Number(res.headers.get("content-length")) || 0;
			const reader = res.body?.getReader();
			let bytes;

			if (reader) {
				const chunks = [];
				let got = 0;
				for (;;) {
					const { done, value } = await reader.read();
					if (token !== loadToken) {
						reader.cancel();
						return;
					}
					if (done) break;
					chunks.push(value);
					got += value.length;
					const label = total
						? `Downloading - ${fmtBytes(got)} of ${fmtBytes(total)}`
						: `Downloading - ${fmtBytes(got)}`;
					setProgress(total ? 8 + (got / total) * 72 : Math.min(70, 8 + got / 4096), label);
				}
				bytes = new Blob(chunks);
				logAsset(url.split("/").pop().split("?")[0], got);
			} else {
				bytes = await res.blob();
			}

			// Served as text/plain and run from a blob:, so it needs re-typing
			// as HTML and a base to resolve any relative asset paths against.
			blobUrl = URL.createObjectURL(
				new Blob([prepareDoc(await bytes.text(), url, volume)], { type: "text/html" })
			);
			setProgress(82, "Handing off to the game");
		} catch (e) {
			if (token !== loadToken) return;
			failLoader(`Couldn't fetch ${game.name} - ${e.message}. Check its link in games.json.`);
			return;
		}
		if (token !== loadToken) {
			URL.revokeObjectURL(blobUrl);
			return;
		}

		// 3. Boot - the frame's load event is the only real "it started".
		const startedAt = performance.now();
		const tick = () => {
			const secs = (performance.now() - startedAt) / 1000;
			setProgress(
				82 + Math.min(10, secs * 3),
				`Starting the game - ${secs.toFixed(1)}s`
			);
		};
		tick();
		clearInterval(elapsedTimer);
		elapsedTimer = setInterval(tick, 200);

		releaseFrame();
		frameBlob = blobUrl;

		try {
			await new Promise((resolve, reject) => {
				const done = (fn, arg) => {
					clearTimeout(timer);
					frameEl.removeEventListener("load", onLoad);
					frameEl.removeEventListener("error", onError);
					fn(arg);
				};
				const onLoad = () => done(resolve);
				const onError = () => done(reject, new Error("the game wouldn't start"));
				const timer = setTimeout(
					() => done(reject, new Error("the game took too long to start")),
					BOOT_TIMEOUT
				);
				frameEl.addEventListener("load", onLoad);
				frameEl.addEventListener("error", onError);
				frameEl.src = blobUrl;
			});
		} catch (e) {
			if (token !== loadToken) return;
			failLoader(`Couldn't load ${game.name} - ${e.message}.`);
			return;
		}

		if (token !== loadToken) return;
		clearInterval(elapsedTimer);

		// 4. Assets - the game's own resource timeline, live.
		applyVolume(volume, { save: false });
		setWorking("Loading assets");
		const { count, bytes } = await watchAssets(token);
		if (token !== loadToken) return;

		setProgress(
			100,
			count ? `Ready - ${count} files · ${fmtBytes(bytes)}` : "Ready"
		);
		setTimeout(() => {
			if (token !== loadToken) return;
			hideLoader();
		}, 520);
	}

	async function openGame(game) {
		if (!game) return;
		if (searchOpen()) closeSearch();
		playing = game;

		recent = [game.slug, ...recent.filter((s) => s !== game.slug)];
		saveList(RECENT_KEY, recent);

		catalogEl.hidden = true;
		topbarEl.hidden = true;
		playerEl.hidden = false;
		stageEl.classList.add("is-loading");
		stageEl.classList.remove("chrome-reveal", "show-chrome");

		crumbEl.innerHTML = `
			${icon("gamepad")}
			<span>Games</span>
			${icon("chevronRight", "crumb__sep")}
			<strong>${esc(game.name)}</strong>`;
		railFav.classList.toggle("on", isFav(game.slug));

		awardPlayXp(game.slug);

		// No link yet - say so rather than loading an empty frame.
		if (!game.link) {
			loadEl.hidden = true;
			blankEl.hidden = false;
			blankEl.querySelector("[data-blank-title]").textContent = game.name;
			frameEl.hidden = true;
			revealChrome();
			return;
		}

		blankEl.hidden = true;
		// Blank the old game and raise the loader *before* the frame is shown,
		// otherwise the previous embed flashes up for a frame underneath it.
		try {
			frameEl.src = "about:blank";
		} catch {}
		releaseFrame();
		showLoader(game);
		frameEl.hidden = false;
		// Embeds load straight from their host - no proxy in the way.
		loadGame(game, embedUrl(game.link), ++loadToken);
	}

	function closeGame() {
		playing = null;
		loadToken++;
		clearInterval(elapsedTimer);
		pageMuted = false;
		volumeBeforeLeave = null;
		loadEl.hidden = true;
		loadEl.classList.remove("is-open", "is-failed");
		stageEl.classList.remove("is-loading", "chrome-reveal", "show-chrome");
		playerEl.hidden = true;
		catalogEl.hidden = false;
		topbarEl.hidden = false;
		try {
			frameEl.src = "about:blank";
		} catch {}
		releaseFrame();
		render();
	}

	function showError(message) {
		errorEl.hidden = !message;
		errorEl.textContent = message || "";
	}

	/* ── Wiring ─────────────────────────────────────────────────── */

	/* ── Search overlay ─────────────────────────────────────────── */

	function renderSearchFilters() {
		const chips = [{ id: "all", label: "All" }, ...categories().slice(1)];
		searchFiltersEl.innerHTML = chips
			.map(
				(c) =>
					`<button type="button" class="chip${searchFilter === c.id ? " on" : ""}" data-filter="${esc(c.id)}">${esc(c.label)}</button>`
			)
			.join("");
		searchFiltersEl.querySelectorAll("[data-filter]").forEach((btn) => {
			btn.addEventListener("click", () => {
				searchFilter = btn.dataset.filter;
				searchFiltersEl
					.querySelectorAll("[data-filter]")
					.forEach((b) => b.classList.toggle("on", b === btn));
				renderSearchResults();
			});
		});
	}

	function renderSearchResults() {
		if (!query.trim()) {
			searchResultsEl.innerHTML = `
				<div class="search-idle">
					${icon("gamepad")}
					<strong>${all.length} games waiting</strong>
					<span>Start typing to find one by name or studio</span>
				</div>`;
			return;
		}

		const hits = searchList();
		searchResultsEl.innerHTML = hits.length
			? `<div class="gm-grid gm-grid--search">${hits.map((g) => tile(g)).join("")}</div>`
			: `<div class="search-idle">
					${icon("search")}
					<strong>Nothing matches “${esc(query.trim())}”</strong>
					<span>Try a shorter word, or part of the studio name</span>
				</div>`;
		bindTiles(searchResultsEl);
		sweepLoaded(searchResultsEl);
	}

	function openSearch() {
		searchOverlay.hidden = false;
		setTimeout(() => searchOverlay.classList.add("is-open"), 16);
		setTimeout(() => searchInput.focus(), 120);
		renderSearchFilters();
		renderSearchResults();
	}

	function closeSearch() {
		searchOverlay.classList.remove("is-open");
		setTimeout(() => {
			searchOverlay.hidden = true;
		}, 240);
	}

	const searchOpen = () => !searchOverlay.hidden;

	searchInput.addEventListener("input", () => {
		query = searchInput.value;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(renderSearchResults, 180);
	});
	searchInput.addEventListener("keydown", (e) => {
		if (e.key === "Escape") closeSearch();
	});

	el.querySelector("[data-search-open]").addEventListener("click", openSearch);
	el.querySelectorAll("[data-search-close]").forEach((btn) => {
		btn.addEventListener("click", closeSearch);
	});

	/*
	 * Each tile keeps its own shimmer until its artwork decodes, so the row
	 * doesn't go from skeleton straight to a grid of empty boxes.
	 */
	function markLoaded(img) {
		if (!img || img.tagName !== "IMG") return;
		img.classList.add("is-loaded");
		img.closest(".gm-tile__art")?.classList.remove("is-loading");
	}

	el.addEventListener("load", (e) => markLoaded(e.target), true);
	el.addEventListener("error", (e) => markLoaded(e.target), true);

	/** Cached art can finish before the listeners ever see an event. */
	function sweepLoaded(scope) {
		scope.querySelectorAll(".gm-tile__art.is-loading img").forEach((img) => {
			if (img.complete && img.naturalWidth) markLoaded(img);
		});
	}

	// The observer catches layout shifts with no window resize behind them
	// (taskbar style changes); the window listener is the dependable path.
	const catalogResize = new ResizeObserver(() => syncPosterWidth());
	catalogResize.observe(catalogEl);

	let resizeTimer = null;
	const onResize = () => {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(syncPosterWidth, 120);
	};
	window.addEventListener("resize", onResize);

	// The topbar only earns a backdrop once there's content behind it.
	catalogEl.addEventListener(
		"scroll",
		() => {
			topbarEl.classList.toggle("is-stuck", catalogEl.scrollTop > 24);
		},
		{ passive: true }
	);

	el.querySelector("[data-back]").addEventListener("click", closeGame);
	el.querySelector("[data-reload]").addEventListener("click", () => {
		if (playing?.link) loadGame(playing, embedUrl(playing.link), ++loadToken);
	});
	el.querySelector("[data-load-cancel]").addEventListener("click", closeGame);
	loadRetry.addEventListener("click", () => {
		loadEl.classList.remove("is-failed");
		if (playing?.link) loadGame(playing, embedUrl(playing.link), ++loadToken);
	});
	railFav.addEventListener("click", (e) => {
		if (!playing) return;
		favs = isFav(playing.slug)
			? favs.filter((s) => s !== playing.slug)
			: [playing.slug, ...favs];
		saveList(FAV_KEY, favs);
		e.currentTarget.classList.toggle("on", isFav(playing.slug));
	});
	/* ── XP ─────────────────────────────────────────────────────── */

	/**
	 * Opening a game pays XP, so bouncing in and out of one was free money.
	 * Two brakes: a cooldown between awards, and never the same game twice in
	 * a row. The window is randomised so the cadence isn't learnable.
	 */
	function awardPlayXp(slug) {
		const now = Date.now();
		const gate = loadValue(XP_GATE_KEY);
		let last = { slug: "", at: 0, wait: XP_COOLDOWN_MIN };
		try {
			if (gate) last = { ...last, ...JSON.parse(gate) };
		} catch {}

		if (slug === last.slug) return;
		if (now - last.at < last.wait) return;

		const wait =
			XP_COOLDOWN_MIN + Math.random() * (XP_COOLDOWN_MAX - XP_COOLDOWN_MIN);
		try {
			localStorage.setItem(
				XP_GATE_KEY,
				JSON.stringify({ slug, at: now, wait: Math.round(wait) })
			);
		} catch {}
		window.dispatchEvent(new CustomEvent("riseub:xp", { detail: "game" }));
	}

	/* ── Volume ─────────────────────────────────────────────────── */

	/** While the Games view is hidden, hold the real level and force mute. */
	let pageMuted = false;
	let volumeBeforeLeave = null;

	/** Pushes into the running game; new games pick it up from the shim. */
	function applyVolume(next, { save = true } = {}) {
		volume = Math.max(0, Math.min(1, next));
		const pct = Math.round(volume * 100);
		if (save) {
			try {
				localStorage.setItem(VOLUME_KEY, String(volume));
			} catch {}
		}
		volInput.value = String(pct);
		volInput.style.setProperty("--pct", `${pct}%`);
		volRead.textContent = String(pct);
		volBtn.innerHTML = icon(volume === 0 ? "volumeOff" : "volume");
		volBtn.classList.toggle("is-muted", volume === 0);
		try {
			frameEl.contentWindow.__riseVolume = volume;
		} catch {}
	}

	/** Called by the router when leaving / returning to the Games view. */
	function onHide() {
		if (pageMuted || !playing || playerEl.hidden) return;
		pageMuted = true;
		volumeBeforeLeave = volume;
		applyVolume(0, { save: false });
	}

	function onShow() {
		if (!pageMuted) return;
		const restore = volumeBeforeLeave;
		pageMuted = false;
		volumeBeforeLeave = null;
		if (restore != null) applyVolume(restore, { save: false });
	}

	volInput.addEventListener("input", () => {
		applyVolume(Number(volInput.value) / 100);
	});
	volBtn.addEventListener("click", () => {
		if (volume > 0) {
			lastVolume = volume;
			applyVolume(0);
		} else {
			applyVolume(lastVolume || 1);
		}
	});
	applyVolume(volume, { save: false });

	el.querySelector("[data-full]").addEventListener("click", () => {
		if (document.fullscreenElement) document.exitFullscreen();
		else stageEl.requestFullscreen?.().catch(() => {});
	});
	el.querySelector("[data-rail-toggle]").addEventListener("click", () => {
		stageEl.classList.toggle("rail-off");
		if (!stageEl.classList.contains("rail-off")) showChrome();
	});

	stageEl.addEventListener("pointermove", showChrome);
	stageEl.addEventListener("pointerenter", showChrome);

	document.addEventListener("keydown", (e) => {
		if (e.key !== "Escape") return;
		if (searchOpen()) {
			closeSearch();
			return;
		}
		if (playing && !document.fullscreenElement) closeGame();
	});

	/* ── Boot ───────────────────────────────────────────────────── */

	catalogEl.innerHTML = skeletonHome();
	syncPosterWidthSoon();

	// The library is a local file, so it lands before the skeleton ever paints.
	// Hold it long enough to read as loading rather than as a flash.
	const bootAt = performance.now();
	const settle = () =>
		new Promise((done) =>
			setTimeout(done, Math.max(0, MIN_SKELETON - (performance.now() - bootAt)))
		);

	fetch("/data/games.json")
		.then((r) => r.json())
		.then(async (json) => {
			data = normalise(json);
			all = Object.values(data).flat();
			bySlug = new Map(all.map((g) => [g.slug, g]));
			if (!all.length) throw new Error("No games in the library file");
			await settle();
			render();
		})
		.catch((e) => {
			showError(`Could not load the library - ${e.message}`);
			catalogEl.innerHTML = "";
			notify("Games unavailable", e.message, "error");
		});

	return {
		onHide,
		onShow,
		destroy() {
			catalogResize.disconnect();
			window.removeEventListener("resize", onResize);
			clearTimeout(resizeTimer);
			closeGame();
			el.remove();
		},
	};
}
