import { icon } from "./icons.js";
import { openModal, promptModal, confirmModal, contextMenu } from "./modal.js";
import { notify } from "./toast.js";
import { registerPlayer, publishState } from "./player-bus.js";

/** Rows revealed per page as you scroll. */
const PAGE = 40;

const MUSIC_KEY = "riseub-music";
const LIKED_KEY = "riseub-music-liked";
const VOLUME_KEY = "riseub-music-volume";
const RECENT_KEY = "riseub-music-recent";

function loadPlaylists() {
	try {
		const raw = localStorage.getItem(MUSIC_KEY);
		if (raw) return JSON.parse(raw);
	} catch {}
	// No starter playlist - Liked already lives in the library list.
	return [];
}

function savePlaylists(list) {
	try {
		localStorage.setItem(MUSIC_KEY, JSON.stringify(list));
	} catch {}
}

function loadLiked() {
	try {
		const raw = localStorage.getItem(LIKED_KEY);
		if (raw) return JSON.parse(raw);
	} catch {}
	return [];
}

function saveLiked(list) {
	try {
		localStorage.setItem(LIKED_KEY, JSON.stringify(list));
	} catch {}
}

function loadRecent() {
	try {
		const raw = localStorage.getItem(RECENT_KEY);
		if (raw) return JSON.parse(raw);
	} catch {}
	return [];
}

function saveRecent(list) {
	try {
		localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 40)));
	} catch {}
}

function loadVolume() {
	const stored = localStorage.getItem(VOLUME_KEY);
	if (stored === null) return 1;
	const raw = Number(stored);
	return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 1;
}

function formatMs(ms) {
	const s = Math.floor((ms || 0) / 1000);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function formatSec(sec) {
	const s = Math.floor(sec || 0);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function esc(s) {
	const d = document.createElement("div");
	d.textContent = s == null ? "" : s;
	return d.innerHTML;
}

/** Cover markup - missing/broken art matches the now__art music-icon placeholder. */
function artHtml(url, { lazy = false, src } = {}) {
	if (!url && !src) return icon("music");
	return `<img src="${esc(src || url)}" alt=""${lazy ? ' loading="lazy"' : ""} data-art-img />`;
}

let hlsModulePromise = null;
function loadHls() {
	if (!hlsModulePromise) {
		hlsModulePromise = import("https://cdn.jsdelivr.net/npm/hls.js@1.5.17/+esm")
			.then((m) => m.default || m.Hls || m)
			.catch(() => null);
	}
	return hlsModulePromise;
}

export function initMusic(root, { ensureScramjet, proxify }) {
	let playlists = loadPlaylists();
	let liked = loadLiked();
	let trending = [];
	let results = [];
	let query = "";
	let view = "discover";
	/** How many rows are on screen; grows as you reach the tail. */
	let shown = PAGE;
	let listKey = "";
	let searchMore = false;
	let pagingMore = false;
	let tailObserver = null;
	let dragId = null;
	let activePlaylistId = null;
	let queue = [];
	let queueIndex = 0;
	let playing = false;
	let loading = true;
	let searching = false;
	let loopTrack = false;
	let loopPlaylist = true;
	let shuffle = false;
	let searchTimer = null;
	let loadingTrackId = null;
	let playGen = 0;
	let failed = null;
	let recent = loadRecent();
	let hls = null;
	/** Which transport the active load is using - drives the error fallback. */
	let streamMode = "";

	const audio = document.createElement("audio");
	audio.preload = "metadata";
	audio.volume = loadVolume();

	/*
	 * Covers go through the image relay (same-origin, always works).
	 * Streams must NOT - /api/img is not audio.
	 */
	const artRelay = (url) =>
		url ? `/api/img?url=${encodeURIComponent(url)}` : url;

	/** Always mint stream URLs against the utility frame (not a Browse/Games tab). */
	let proxyFrame = null;
	async function readyProxy() {
		proxyFrame = (await ensureScramjet?.()) || proxyFrame;
		return proxyFrame;
	}
	const streamViaProxy = (url) => {
		if (!url) return url;
		try {
			return proxify?.(url, proxyFrame) || url;
		} catch {
			return url;
		}
	};

	const cover = (url, opts = {}) =>
		artHtml(url, { ...opts, src: url ? artRelay(url) : "" });

	function destroyHls() {
		if (!hls) return;
		try {
			hls.destroy();
		} catch {}
		hls = null;
	}

	function waitCanPlay(el, gen) {
		return new Promise((resolve, reject) => {
			if (gen !== playGen) {
				reject(new DOMException("Superseded", "AbortError"));
				return;
			}
			const done = (fn) => () => {
				el.removeEventListener("canplay", onOk);
				el.removeEventListener("error", onErr);
				fn();
			};
			const onOk = done(() => resolve());
			const onErr = done(() => {
				const err = el.error;
				const msg =
					err?.message ||
					(err?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
						? "No supported source"
						: "Media failed");
				reject(new Error(msg));
			});
			el.addEventListener("canplay", onOk, { once: true });
			el.addEventListener("error", onErr, { once: true });
		});
	}

	const el = document.createElement("div");
	el.className = "media-page music-page";
	el.innerHTML = `
		<div class="media-topbar">
			<div class="media-brand">
				${icon("music", "media-brand__icon")}
				<div><h1>Music</h1><p class="media-sub" data-stats>Loading charts…</p></div>
			</div>
			<div class="media-search-wrap">
				${icon("search", "media-search__icon")}
				<input type="search" class="media-search" placeholder="Search songs, artists…" data-search aria-label="Search music" />
			</div>
		</div>

		<div class="music-layout">
			<aside class="music-sidebar" data-sidebar></aside>

			<div class="music-main">
				<div class="media-alert" data-error hidden></div>
				<div class="music-head">
					<h2 data-list-title>Trending</h2>
					<span class="music-count" data-count></span>
				</div>
				<div class="music-tracks" data-tracks></div>
			</div>

			<aside class="now-panel">
				<p class="now__label">${icon("disc")}<span>Now playing</span></p>
				<div class="now__art" data-now-art>${icon("music")}</div>
				<div class="now__meta">
					<strong data-now-title>Nothing playing</strong>
					<span data-now-artist>Pick a track to start</span>
				</div>
				<div class="now__bar" data-progress><div data-progress-fill></div></div>
				<div class="now__times">
					<span data-elapsed>0:00</span>
					<span data-total>0:00</span>
				</div>
				<div class="now__controls">
					<button type="button" class="now__btn" data-shuffle title="Shuffle">${icon("shuffle")}</button>
					<button type="button" class="now__btn" data-prev title="Previous">${icon("skipBack", "lucide--fill")}</button>
					<button type="button" class="now__play" data-play-pause title="Play">${icon("play", "lucide--fill")}</button>
					<button type="button" class="now__btn" data-next title="Next">${icon("skipForward", "lucide--fill")}</button>
					<button type="button" class="now__btn" data-loop title="Repeat">${icon("repeat")}</button>
				</div>
				<div class="now__volume">
					<button type="button" class="now__btn" data-mute title="Mute">${icon("volume")}</button>
					<input type="range" class="now__slider" min="0" max="100" step="1" data-volume aria-label="Volume" />
					<span class="now__vol-read" data-vol-read>80</span>
				</div>
				<div class="now__queue" data-queue></div>
			</aside>
		</div>`;
	root.appendChild(el);

	const statsEl = el.querySelector("[data-stats]");
	const errorEl = el.querySelector("[data-error]");
	const tracksEl = el.querySelector("[data-tracks]");
	const sidebarEl = el.querySelector("[data-sidebar]");
	const listTitle = el.querySelector("[data-list-title]");
	const countEl = el.querySelector("[data-count]");
	const searchInput = el.querySelector("[data-search]");
	const artEl = el.querySelector("[data-now-art]");
	const titleEl = el.querySelector("[data-now-title]");
	const artistEl = el.querySelector("[data-now-artist]");
	const progressEl = el.querySelector("[data-progress]");
	const progressFill = el.querySelector("[data-progress-fill]");
	const elapsedEl = el.querySelector("[data-elapsed]");
	const totalEl = el.querySelector("[data-total]");
	const playBtn = el.querySelector("[data-play-pause]");
	const shuffleBtn = el.querySelector("[data-shuffle]");
	const loopBtn = el.querySelector("[data-loop]");
	const muteBtn = el.querySelector("[data-mute]");
	const volumeInput = el.querySelector("[data-volume]");
	const volumeRead = el.querySelector("[data-vol-read]");
	const queueEl = el.querySelector("[data-queue]");

	const current = () => queue[queueIndex] || null;

	el.addEventListener(
		"error",
		(e) => {
			const img = e.target;
			if (!(img instanceof HTMLImageElement) || !img.hasAttribute("data-art-img")) return;
			const host = img.parentElement;
			if (!host) return;
			host.innerHTML = icon("music");
			if (host === artEl) host.classList.toggle("is-spinning", playing);
		},
		true
	);

	function showError(msg) {
		errorEl.hidden = !msg;
		errorEl.textContent = msg || "";
	}

	function isLiked(id) {
		return liked.some((t) => t.id === id);
	}

	function displayList() {
		// Picking a playlist while a search is open should show the playlist.
		if (view === "liked") return liked;
		if (view === "recent") return recent;
		if (view === "playlist") {
			return playlists.find((p) => p.id === activePlaylistId)?.tracks || [];
		}
		if (view === "search") return results;
		return trending;
	}

	function listLabel() {
		if (view === "liked") return "Liked songs";
		if (view === "recent") return "Recently played";
		if (view === "playlist") {
			return playlists.find((p) => p.id === activePlaylistId)?.name || "Playlist";
		}
		if (view === "search") return `Results for “${query.trim()}”`;
		return "Trending";
	}

	/* ── Sidebar ────────────────────────────────────────────────── */

	function renderSidebar() {
		sidebarEl.innerHTML = `
			<p class="side-label">Library</p>
			<button type="button" class="side-btn${view === "discover" ? " on" : ""}" data-view="discover">${icon("zap")}<span>Discover</span></button>
			<button type="button" class="side-btn${view === "liked" ? " on" : ""}" data-view="liked">${icon("heart")}<span>Liked</span><em>${liked.length}</em></button>
			${
				recent.length
					? `<button type="button" class="side-btn${view === "recent" ? " on" : ""}" data-view="recent">${icon("clock")}<span>Recently played</span><em>${recent.length}</em></button>`
					: ""
			}
			<p class="side-label side-row">Playlists<button type="button" class="link-btn" data-new-pl aria-label="New playlist">${icon("plus")}</button></p>
			${
				playlists.length
					? playlists
							.map(
								(pl) =>
									`<button type="button" class="side-btn${view === "playlist" && activePlaylistId === pl.id ? " on" : ""}" data-pl="${pl.id}">${icon("listMusic")}<span>${esc(pl.name)}</span><em>${pl.tracks.length}</em></button>`
							)
							.join("")
					: `<p class="side-hint">No playlists yet</p>`
			}`;

		sidebarEl.querySelector('[data-view="discover"]')?.addEventListener("click", () => {
			view = "discover";
			query = "";
			searchInput.value = "";
			render();
		});
		sidebarEl.querySelector('[data-view="liked"]')?.addEventListener("click", () => {
			view = "liked";
			render();
		});
		sidebarEl.querySelector('[data-view="recent"]')?.addEventListener("click", () => {
			view = "recent";
			render();
		});
		sidebarEl.querySelector("[data-new-pl]")?.addEventListener("click", async () => {
			const name = await promptModal({
				title: "New playlist",
				subtitle: "Give it a name - you can add tracks straight after.",
				label: "Playlist name",
				placeholder: "Late night mix",
				confirmText: "Create",
			});
			if (!name) return;
			const pl = { id: `pl-${Date.now()}`, name, tracks: [], createdAt: Date.now() };
			playlists.push(pl);
			savePlaylists(playlists);
			activePlaylistId = pl.id;
			view = "playlist";
			render();
			notify("Playlist created", name, "success");
		});
		sidebarEl.querySelectorAll("[data-pl]").forEach((btn) => {
			btn.addEventListener("click", () => {
				activePlaylistId = btn.dataset.pl;
				view = "playlist";
				render();
			});

			// Same right-click affordances as the quick apps launcher.
			btn.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				const pl = playlists.find((p) => p.id === btn.dataset.pl);
				if (!pl) return;

				contextMenu(e.clientX, e.clientY, [
					{
						label: "Rename",
						icon: "settings",
						run: async () => {
							const name = await promptModal({
								title: "Rename playlist",
								label: "Name",
								value: pl.name,
								confirmText: "Rename",
							});
							if (!name) return;
							pl.name = name;
							savePlaylists(playlists);
							render();
						},
					},
					{
						label: "Delete",
						icon: "trash",
						danger: true,
						run: async () => {
							const ok = await confirmModal({
								title: `Delete ${pl.name}?`,
								subtitle: `${pl.tracks.length} track${pl.tracks.length === 1 ? "" : "s"} will be removed from this playlist.`,
								confirmText: "Delete",
								danger: true,
							});
							if (!ok) return;
							playlists = playlists.filter((p) => p.id !== pl.id);
							savePlaylists(playlists);
							if (activePlaylistId === pl.id) {
								activePlaylistId = null;
								view = "discover";
							}
							render();
							notify("Playlist deleted", pl.name, "success");
						},
					},
				]);
			});
		});
	}

	/* ── Track list ─────────────────────────────────────────────── */

	function skeletonRows(n = 8) {
		return Array.from(
			{ length: n },
			() => `
			<div class="track-row track-row--skeleton">
				<div class="track-art skeleton"></div>
				<div class="track-info">
					<div class="skeleton sk-line"></div>
					<div class="skeleton sk-line sk-line--short"></div>
				</div>
			</div>`
		).join("");
	}

	function trackRowHtml(track, i) {
		const active = current()?.id === track.id;
		return `
			<div class="track-row${active ? " on" : ""}" data-track="${track.id}">
				<span class="track-num">
					<span class="track-num__n">${active && playing ? `<span class="eq"><i></i><i></i><i></i></span>` : i + 1}</span>
					<span class="track-num__play">${icon(active && playing ? "pause" : "play", "lucide--fill")}</span>
				</span>
				<div class="track-art">${cover(track.artwork, { lazy: true })}</div>
				<div class="track-info"><strong>${esc(track.title)}</strong><span>${esc(track.artist)}</span></div>
				<span class="track-dur">${formatMs(track.duration)}</span>
				<button type="button" class="icon-btn${isLiked(track.id) ? " on" : ""}" data-like title="Like">${icon("heart")}</button>
				<button type="button" class="icon-btn" data-add title="Add to playlist">${icon("plus")}</button>
			</div>`;
	}

	function wireTrackRows(scope, list) {
		scope.querySelectorAll(".track-row").forEach((row) => {
			const id = row.dataset.track;
			const track = list.find((t) => t.id === id);
			if (!track) return;
			row.addEventListener("click", (e) => {
				if (e.target.closest("button")) return;
				queue = list.slice();
				queueIndex = list.findIndex((t) => t.id === id);
				playCurrent();
			});
			row.querySelector("[data-like]")?.addEventListener("click", (e) => {
				e.stopPropagation();
				if (isLiked(id)) liked = liked.filter((t) => t.id !== id);
				else liked = [track, ...liked];
				saveLiked(liked);
				render();
			});
			row.querySelector("[data-add]")?.addEventListener("click", (e) => {
				e.stopPropagation();
				openAddToPlaylist(track);
			});

			row.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				const items = [
					{ label: "Add to playlist", icon: "plus", run: () => openAddToPlaylist(track) },
					{
						label: isLiked(id) ? "Unlike" : "Like",
						icon: "heart",
						run: () => {
							if (isLiked(id)) liked = liked.filter((t) => t.id !== id);
							else liked = [track, ...liked];
							saveLiked(liked);
							render();
						},
					},
				];
				if (view === "playlist") {
					items.push({
						label: "Remove from playlist",
						icon: "trash",
						danger: true,
						run: () => removeFromPlaylist(id),
					});
				}
				contextMenu(e.clientX, e.clientY, items);
			});
		});
	}

	function remember(track) {
		if (!track?.id) return;
		recent = [track, ...recent.filter((t) => t.id !== track.id)].slice(0, 40);
		saveRecent(recent);
	}

	function renderTracks() {
		// Any change of list starts the paging over.
		const key = `${view}:${activePlaylistId || ""}:${query.trim()}`;
		if (key !== listKey) {
			listKey = key;
			shown = PAGE;
		}

		const full = displayList();
		const list = full.slice(0, shown);
		listTitle.textContent = listLabel();

		if (loading || searching) {
			countEl.textContent = "";
			tracksEl.innerHTML = skeletonRows();
			return;
		}

		countEl.textContent = full.length ? `${full.length} tracks` : "";

		if (!full.length && !(view === "discover" && recent.length)) {
			tracksEl.innerHTML = `<p class="media-empty">${icon("music")}${
				query ? "No tracks match that search." : "Nothing here yet."
			}</p>`;
			return;
		}

		const recentBlock =
			view === "discover" && recent.length
				? `<div class="music-recent">
					<div class="music-recent__head">
						<h3>Recently played</h3>
						<button type="button" class="link-btn" data-clear-recent>Clear</button>
					</div>
					${recent.map((track, i) => trackRowHtml(track, i)).join("")}
				</div>`
				: "";

		const mainList =
			list.length
				? `<div class="music-tracklist" data-tracklist>${list
						.map((track, i) => trackRowHtml(track, i))
						.join("")}</div>`
				: "";

		const moreBlock =
			full.length > shown || (view === "search" && searchMore)
				? `<div class="music-more" data-more-row>${
						pagingMore ? skeletonRows(3) : ""
					}</div>`
				: "";

		tracksEl.innerHTML = `${recentBlock}${mainList}${moreBlock}`;

		if (view === "discover" && recent.length) {
			tracksEl.querySelector("[data-clear-recent]")?.addEventListener("click", () => {
				recent = [];
				saveRecent(recent);
				render();
				notify("Cleared", "Recently played is empty", "success");
			});
			wireTrackRows(tracksEl.querySelector(".music-recent"), recent);
		}
		wireTrackRows(tracksEl.querySelector("[data-tracklist]") || tracksEl, list);
		if (view === "playlist") wireReorder(tracksEl.querySelector("[data-tracklist]"));
		watchTail();
	}

	/* ── Infinite scroll ────────────────────────────────────────── */

	/**
	 * Reveals another page as the tail comes into view, and - in search -
	 * pulls the next page off the API once the local results run out.
	 */
	function watchTail() {
		tailObserver?.disconnect();
		const tail = tracksEl.querySelector("[data-more-row]");
		if (!tail) return;

		tailObserver = new IntersectionObserver(
			(entries) => {
				if (!entries.some((e) => e.isIntersecting)) return;
				loadMore();
			},
			{ root: tracksEl, rootMargin: "300px" }
		);
		tailObserver.observe(tail);
	}

	// Belt and braces: the observer misses if the list is short enough that the
	// tail starts on screen, and scrolling is the signal users expect anyway.
	tracksEl.addEventListener(
		"scroll",
		() => {
			const nearEnd =
				tracksEl.scrollTop + tracksEl.clientHeight >= tracksEl.scrollHeight - 320;
			if (nearEnd) loadMore();
		},
		{ passive: true }
	);

	async function loadMore() {
		const full = displayList();
		if (full.length > shown) {
			shown += PAGE;
			renderTracks();
			return;
		}
		// Local list exhausted - only search can fetch further.
		if (view !== "search" || !searchMore || pagingMore) return;

		pagingMore = true;
		renderTracks();
		try {
			const res = await fetch(
				`/api/music/search?q=${encodeURIComponent(query.trim())}&offset=${results.length}`
			);
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "Search failed");
			const fresh = (data.tracks || []).filter(
				(t) => !results.some((r) => r.id === t.id)
			);
			results = [...results, ...fresh];
			searchMore = !!data.more && fresh.length > 0;
			shown = Math.max(shown, results.length);
		} catch {
			searchMore = false;
		}
		pagingMore = false;
		renderTracks();
	}

	/* ── Drag to reorder (playlists) ────────────────────────────── */

	/** Playlist order is the user's, so let them rearrange it by hand. */
	function wireReorder(listEl) {
		if (!listEl) return;
		const playlist = playlists.find((p) => p.id === activePlaylistId);
		if (!playlist) return;

		listEl.querySelectorAll(".track-row").forEach((row) => {
			row.draggable = true;

			row.addEventListener("dragstart", (e) => {
				dragId = row.dataset.track;
				row.classList.add("is-dragging");
				e.dataTransfer.effectAllowed = "move";
				// Firefox needs payload before a drag will start.
				e.dataTransfer.setData("text/plain", dragId);
			});

			row.addEventListener("dragend", () => {
				dragId = null;
				listEl.querySelectorAll(".track-row").forEach((r) => {
					r.classList.remove("is-dragging", "is-over");
				});
			});

			row.addEventListener("dragover", (e) => {
				if (!dragId || row.dataset.track === dragId) return;
				e.preventDefault();
				row.classList.add("is-over");
			});

			row.addEventListener("dragleave", () => row.classList.remove("is-over"));

			row.addEventListener("drop", (e) => {
				e.preventDefault();
				row.classList.remove("is-over");
				const target = row.dataset.track;
				if (!dragId || dragId === target) return;

				const from = playlist.tracks.findIndex((t) => t.id === dragId);
				const to = playlist.tracks.findIndex((t) => t.id === target);
				if (from === -1 || to === -1) return;

				const [moved] = playlist.tracks.splice(from, 1);
				playlist.tracks.splice(to, 0, moved);
				savePlaylists(playlists);
				render();
			});
		});
	}

	function removeFromPlaylist(trackId) {
		const playlist = playlists.find((p) => p.id === activePlaylistId);
		if (!playlist) return;
		const track = playlist.tracks.find((t) => t.id === trackId);
		playlist.tracks = playlist.tracks.filter((t) => t.id !== trackId);
		savePlaylists(playlists);
		render();
		notify("Removed", `${track?.title || "Track"} left ${playlist.name}`, "success");
	}

	/* ── Add to playlist ────────────────────────────────────────── */

	function openAddToPlaylist(track) {
		const modal = openModal({
			title: "Add to playlist",
			subtitle: `${track.title} - ${track.artist}`,
			size: "sm",
			body: `<div class="pl-picker" data-picker></div>`,
		});

		const picker = modal.body.querySelector("[data-picker]");

		function paint() {
			picker.innerHTML = `
				${playlists
					.map((pl) => {
						const has = pl.tracks.some((t) => t.id === track.id);
						return `
					<button type="button" class="pl-row${has ? " is-in" : ""}" data-pl="${pl.id}">
						<span class="pl-row__art">${
							pl.tracks[0]?.artwork
								? cover(pl.tracks[0].artwork)
								: icon("listMusic")
						}</span>
						<span class="pl-row__meta">
							<strong>${esc(pl.name)}</strong>
							<span>${pl.tracks.length} track${pl.tracks.length === 1 ? "" : "s"}</span>
						</span>
						<span class="pl-row__state">${has ? icon("check") : icon("plus")}</span>
					</button>`;
					})
					.join("")}
				<button type="button" class="pl-new" data-new>${icon("plus")}<span>New playlist</span></button>`;

			picker.querySelectorAll("[data-pl]").forEach((btn) => {
				btn.addEventListener("click", () => {
					const pl = playlists.find((p) => p.id === btn.dataset.pl);
					const has = pl.tracks.some((t) => t.id === track.id);
					if (has) pl.tracks = pl.tracks.filter((t) => t.id !== track.id);
					else pl.tracks.push(track);
					savePlaylists(playlists);
					paint();
					render();
					notify(
						has ? "Removed from playlist" : "Added to playlist",
						`${track.title} - ${pl.name}`,
						"music"
					);
				});
			});

			picker.querySelector("[data-new]").addEventListener("click", async () => {
				const name = await promptModal({
					title: "New playlist",
					label: "Playlist name",
					placeholder: "Late night mix",
					confirmText: "Create",
				});
				if (!name) return;
				playlists.push({
					id: `pl-${Date.now()}`,
					name,
					tracks: [track],
					createdAt: Date.now(),
				});
				savePlaylists(playlists);
				paint();
				render();
				notify("Playlist created", `${name} · 1 track`, "success");
			});
		}

		paint();
	}

	/* ── Now playing panel ──────────────────────────────────────── */

	function renderNowPlaying() {
		const t = current();
		artEl.innerHTML = cover(t?.artwork);
		artEl.classList.toggle("is-spinning", playing && !t?.artwork);
		titleEl.textContent = t?.title || "Nothing playing";
		artistEl.textContent = t?.artist || "Pick a track to start";
		playBtn.innerHTML = icon(playing ? "pause" : "play", "lucide--fill");
		playBtn.title = playing ? "Pause" : "Play";
		loopBtn.innerHTML = icon(loopTrack ? "repeatOne" : "repeat");
		loopBtn.classList.toggle("on", loopTrack || loopPlaylist);
		shuffleBtn.classList.toggle("on", shuffle);
		renderQueue();
		pushState();
	}

	function renderQueue() {
		const next = queue.slice(queueIndex + 1, queueIndex + 4);
		if (!next.length) {
			queueEl.innerHTML = "";
			return;
		}
		queueEl.innerHTML = `
			<p class="now__label">${icon("listMusic")}<span>Up next</span></p>
			${next
				.map(
					(t) => `
				<div class="queue-row" data-queue-id="${t.id}">
					<div class="queue-art">${cover(t.artwork, { lazy: true })}</div>
					<div class="queue-info"><strong>${esc(t.title)}</strong><span>${esc(t.artist)}</span></div>
				</div>`
				)
				.join("")}`;

		queueEl.querySelectorAll("[data-queue-id]").forEach((row) => {
			row.addEventListener("click", () => {
				const idx = queue.findIndex((t) => t.id === row.dataset.queueId);
				if (idx >= 0) {
					queueIndex = idx;
					playCurrent();
				}
			});
		});
	}

	function updateVolumeUi() {
		const pct = Math.round(audio.volume * 100);
		volumeInput.value = String(audio.muted ? 0 : pct);
		volumeRead.textContent = String(audio.muted ? 0 : pct);
		muteBtn.innerHTML = icon(
			audio.muted || audio.volume === 0 ? "volumeOff" : "volume"
		);
		volumeInput.style.setProperty(
			"--fill",
			`${audio.muted ? 0 : pct}%`
		);
	}

	function render() {
		renderSidebar();
		renderTracks();
		renderNowPlaying();
	}

	/* ── Playback ───────────────────────────────────────────────── */

	/**
	 * Resolve a signed CDN URL, then try: Scramjet → direct CDN → our audio
	 * pipe. Covers use /api/img; streams must never go through that.
	 */
	async function playCurrent({ prefer = "proxy" } = {}) {
		const track = current();
		if (!track) return;
		const gen = ++playGen;
		showError("");
		loadingTrackId = track.id;
		failed = null;
		destroyHls();

		try {
			await readyProxy();
			const res = await fetch(`/api/music/stream/${track.id}`);
			const data = await res.json().catch(() => ({}));
			if (gen !== playGen) return;
			if (!res.ok || !data.streamUrl) {
				throw new Error(data.error || "Stream failed");
			}

			const streamUrl = data.streamUrl;
			const isHls =
				data.protocol === "hls" || /\.m3u8(\?|$)/i.test(streamUrl);

			if (isHls) {
				const canNative = !!audio.canPlayType(
					"application/vnd.apple.mpegurl"
				);
				if (canNative) {
					streamMode = "direct";
					audio.src = streamUrl;
					audio.load();
					await waitCanPlay(audio, gen);
				} else {
					const Hls = await loadHls();
					if (gen !== playGen) return;
					if (!Hls?.isSupported?.()) {
						// Last resort: server stitches segments into one response.
						streamMode = "pipe";
						audio.src = `/api/music/audio/${track.id}?t=${Date.now()}`;
						audio.load();
						await waitCanPlay(audio, gen);
					} else {
						streamMode = "hls";
						const BaseLoader = Hls.DefaultConfig.loader;
						hls = new Hls({
							enableWorker: true,
							loader: class extends BaseLoader {
								load(context, config, callbacks) {
									if (context?.url) {
										context.url = streamViaProxy(context.url);
									}
									super.load(context, config, callbacks);
								}
							},
						});
						await new Promise((resolve, reject) => {
							const onErr = (_e, info) => {
								if (info?.fatal) {
									reject(new Error(info.details || info.type || "HLS error"));
								}
							};
							hls.on(Hls.Events.MANIFEST_PARSED, () => resolve());
							hls.on(Hls.Events.ERROR, onErr);
							hls.loadSource(streamUrl);
							hls.attachMedia(audio);
						});
					}
				}
			} else {
				const modes =
					prefer === "pipe"
						? ["pipe"]
						: prefer === "direct"
							? ["direct", "pipe"]
							: ["proxy", "direct", "pipe"];

				let lastErr = null;
				for (const mode of modes) {
					if (gen !== playGen) return;
					try {
						streamMode = mode;
						destroyHls();
						if (mode === "pipe") {
							audio.src = `/api/music/audio/${track.id}?t=${Date.now()}`;
						} else if (mode === "proxy") {
							audio.src = streamViaProxy(streamUrl);
						} else {
							audio.src = streamUrl;
						}
						audio.load();
						await waitCanPlay(audio, gen);
						lastErr = null;
						break;
					} catch (err) {
						lastErr = err;
						if (err?.name === "AbortError") throw err;
					}
				}
				if (lastErr) throw lastErr;
			}

			if (gen !== playGen) return;
			await audio.play();
			if (gen !== playGen) return;

			playing = true;
			remember(track);
			window.dispatchEvent(new CustomEvent("riseub:xp", { detail: "track" }));
			renderNowPlaying();
			renderTracks();
			if (view === "discover") renderSidebar();
		} catch (e) {
			if (gen !== playGen || e?.name === "AbortError") return;
			playing = false;
			const message =
				e?.name === "NotAllowedError"
					? "Press play - your browser blocked autoplay"
					: "That track wouldn't stream. Try another one.";
			showError(message);
			if (failed !== track.id) {
				failed = track.id;
				notify("Playback failed", `${track.title} - ${message}`, "error");
			}
			renderNowPlaying();
		}
	}

	function advance(dir) {
		if (!queue.length) return;
		if (shuffle && dir > 0) {
			queueIndex = Math.floor(Math.random() * queue.length);
		} else if (dir > 0) {
			if (queueIndex < queue.length - 1) queueIndex++;
			else if (loopPlaylist) queueIndex = 0;
			else return;
		} else {
			queueIndex = Math.max(0, queueIndex - 1);
		}
		playCurrent();
	}

	/* ── Wiring ─────────────────────────────────────────────────── */

	searchInput.addEventListener("input", () => {
		query = searchInput.value;
		clearTimeout(searchTimer);
		if (!query.trim()) {
			results = [];
			searching = false;
			if (view === "search") view = "discover";
			render();
			return;
		}
		view = "search";
		searching = true;
		renderTracks();
		searchTimer = setTimeout(async () => {
			showError("");
			try {
				const res = await fetch(
					`/api/music/search?q=${encodeURIComponent(query.trim())}`
				);
				const data = await res.json();
				if (!res.ok) throw new Error(data.error || "Search failed");
				results = data.tracks || [];
				searchMore = !!data.more;
			} catch (e) {
				showError(e.message);
				results = [];
			}
			searching = false;
			render();
		}, 300);
	});

	searchInput.addEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			searchInput.value = "";
			query = "";
			results = [];
			render();
		}
	});

	playBtn.addEventListener("click", () => {
		if (!current()) {
			const list = displayList();
			if (!list.length) return;
			queue = list.slice();
			queueIndex = 0;
			playCurrent();
			return;
		}
		if (playing) audio.pause();
		else audio.play().catch(() => {});
	});

	el.querySelector("[data-prev]").addEventListener("click", () => {
		if (audio.currentTime > 3) {
			audio.currentTime = 0;
			return;
		}
		advance(-1);
	});

	el.querySelector("[data-next]").addEventListener("click", () => advance(1));

	shuffleBtn.addEventListener("click", () => {
		shuffle = !shuffle;
		renderNowPlaying();
	});

	loopBtn.addEventListener("click", () => {
		// off → playlist → track → off
		if (!loopPlaylist && !loopTrack) loopPlaylist = true;
		else if (loopPlaylist && !loopTrack) {
			loopPlaylist = false;
			loopTrack = true;
		} else {
			loopTrack = false;
		}
		audio.loop = loopTrack;
		renderNowPlaying();
	});

	muteBtn.addEventListener("click", () => {
		audio.muted = !audio.muted;
		updateVolumeUi();
	});

	volumeInput.addEventListener("input", () => {
		const v = Number(volumeInput.value) / 100;
		audio.muted = false;
		audio.volume = v;
		try {
			localStorage.setItem(VOLUME_KEY, String(v));
		} catch {}
		updateVolumeUi();
	});

	progressEl.addEventListener("click", (e) => {
		if (!audio.duration) return;
		const rect = progressEl.getBoundingClientRect();
		audio.currentTime =
			((e.clientX - rect.left) / rect.width) * audio.duration;
	});

	audio.addEventListener("timeupdate", () => {
		const d = audio.duration || 0;
		progressFill.style.width = d ? `${(audio.currentTime / d) * 100}%` : "0%";
		elapsedEl.textContent = formatSec(audio.currentTime);
		totalEl.textContent = formatSec(d);
		pushState();
	});
	audio.addEventListener("play", () => {
		playing = true;
		failed = null;
		renderNowPlaying();
		renderTracks();
	});
	audio.addEventListener("pause", () => {
		playing = false;
		renderNowPlaying();
		renderTracks();
	});
	audio.addEventListener("ended", () => {
		if (loopTrack) return;
		advance(1);
	});

	// Mid-play drops: step through remaining transports once, then give up.
	audio.addEventListener("error", () => {
		const track = current();
		if (!track || !audio.src || loadingTrackId !== track.id) return;
		if (failed === track.id) return;

		if (streamMode === "proxy") {
			playCurrent({ prefer: "direct" });
			return;
		}
		if (streamMode === "direct" || streamMode === "hls") {
			playCurrent({ prefer: "pipe" });
			return;
		}

		playing = false;
		failed = track.id;
		showError("That track wouldn't play. Try another one.");
		notify("Track skipped", track.title, "error");
		renderNowPlaying();
	});

	/* ── Keyboard shortcuts ─────────────────────────────────────── */

	function typingInField(target) {
		return (
			target instanceof HTMLElement &&
			(target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable)
		);
	}

	/** Only steal the keys where they make sense. */
	function playerHasFocus() {
		if (location.pathname === "/music") return true;
		return !!document.querySelector(".mini-panel.is-open");
	}

	window.addEventListener("keydown", (e) => {
		if (!current() || typingInField(e.target) || e.ctrlKey || e.metaKey) return;
		if (document.body.classList.contains("has-modal")) return;
		if (!playerHasFocus()) return;

		if (e.code === "Space") {
			e.preventDefault();
			if (playing) audio.pause();
			else audio.play().catch(() => {});
		} else if (e.key === "ArrowRight") {
			e.preventDefault();
			audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10);
		} else if (e.key === "ArrowLeft") {
			e.preventDefault();
			audio.currentTime = Math.max(0, audio.currentTime - 10);
		}
	});

	/* ── Mini player bridge ─────────────────────────────────────── */

	function pushState() {
		publishState({
			playing,
			track: current(),
			position: audio.currentTime,
			duration: audio.duration || 0,
			volume: audio.volume,
		});
	}

	registerPlayer({
		toggle() {
			if (!current()) return;
			if (playing) audio.pause();
			else audio.play().catch(() => {});
		},
		next: () => advance(1),
		prev: () => advance(-1),
		seekRatio(ratio) {
			if (!audio.duration) return;
			audio.currentTime = Math.max(0, Math.min(1, ratio)) * audio.duration;
		},
		setVolume(v) {
			audio.volume = Math.max(0, Math.min(1, v));
			updateVolumeUi();
		},
	});

	updateVolumeUi();
	render();

	fetch("/api/music/trending")
		.then((r) => r.json())
		.then((d) => {
			trending = d.tracks || [];
			loading = false;
			statsEl.textContent = trending.length
				? `${trending.length} in the charts`
				: "Charts unavailable";
			render();
		})
		.catch(() => {
			loading = false;
			statsEl.textContent = "Charts unavailable";
			render();
		});

	// Warm the utility proxy frame so the first play doesn't wait on Scramjet boot.
	readyProxy().catch(() => {});

	return {
		destroy() {
			destroyHls();
			audio.pause();
			audio.removeAttribute("src");
			audio.load();
			el.remove();
		},
	};
}
