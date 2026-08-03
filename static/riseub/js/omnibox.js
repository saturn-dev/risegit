import { icon } from "./icons.js";

/** DuckDuckGo, per preference. */
export const SEARCH_ENGINES = [
	{ id: "duckduckgo", label: "DuckDuckGo", host: "duckduckgo.com", url: "https://duckduckgo.com/?q=" },
	{ id: "google", label: "Google", host: "google.com", url: "https://www.google.com/search?q=" },
	{ id: "bing", label: "Bing", host: "bing.com", url: "https://www.bing.com/search?q=" },
];

/** Read straight from prefs so a change takes effect without a reload. */
function searchBase() {
	let id = "duckduckgo";
	try {
		id = JSON.parse(localStorage.getItem("riseub-prefs") || "{}").searchEngine || id;
	} catch {}
	return (SEARCH_ENGINES.find((e) => e.id === id) || SEARCH_ENGINES[0]).url;
}

function looksLikeUrl(input) {
	if (input.includes(" ")) return false;

	if (/^localhost(:\d+)?(\/|$)/i.test(input)) return true;
	if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(input)) return true;
	if (/^[\w.-]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(input)) return true;

	return false;
}

/** Turn bar input into a proxied URL or DuckDuckGo search. */
export function resolveNavigation(input) {
	const raw = input.trim();
	if (!raw) throw new Error("Enter a URL or search term");

	if (/^https?:\/\//i.test(raw)) {
		new URL(raw);
		return { url: raw, kind: "url", label: raw };
	}

	if (looksLikeUrl(raw)) {
		const useHttp =
			/^localhost/i.test(raw) || /^\d{1,3}(\.\d{1,3}){3}/.test(raw);
		const url = `${useHttp ? "http" : "https"}://${raw}`;
		new URL(url);
		return { url, kind: "url", label: url };
	}

	const query = raw;
	return {
		url: `${searchBase()}${encodeURIComponent(query)}`,
		kind: "search",
		label: query,
		query,
	};
}

export function initOmnibox(input, listEl, { onGo }) {
	let items = [];
	let activeIndex = -1;
	let debounceTimer = null;
	let fetchId = 0;

	function hideSuggestions() {
		// Drop the pending debounce and invalidate any request already in the
		// air - otherwise a late reply repaints the list after it was closed.
		clearTimeout(debounceTimer);
		fetchId++;
		listEl.hidden = true;
		listEl.innerHTML = "";
		items = [];
		activeIndex = -1;
	}

	function setActive(index) {
		activeIndex = index;
		listEl.querySelectorAll(".suggest-item").forEach((el, i) => {
			el.classList.toggle("active", i === index);
		});
	}

	function renderSuggestions(suggestions, query) {
		// Results that land after the field lost focus stay closed.
		if (!suggestions.length || document.activeElement !== input) {
			hideSuggestions();
			return;
		}

		items = suggestions;
		listEl.innerHTML = suggestions
			.map(
				(text, i) =>
					`<li><button type="button" class="suggest-item" data-i="${i}" role="option">
						<span class="suggest-icon">${icon(looksLikeUrl(text) ? "globe" : "search")}</span>
						<span class="suggest-text">${escapeHtml(text)}</span>
						<span class="suggest-hint">${looksLikeUrl(text) ? "Go" : "Search"}</span>
					</button></li>`
			)
			.join("");
		listEl.hidden = false;

		listEl.querySelectorAll(".suggest-item").forEach((btn) => {
			btn.addEventListener("mousedown", (e) => {
				e.preventDefault();
				const i = Number(btn.dataset.i);
				selectSuggestion(items[i]);
			});
		});

		setActive(-1);
	}

	function escapeHtml(s) {
		return s
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/"/g, "&quot;");
	}

	async function fetchSuggestions(query) {
		const id = ++fetchId;
		try {
			const res = await fetch(
				`/api/search/suggest?q=${encodeURIComponent(query)}`
			);
			const data = await res.json();
			if (id !== fetchId) return;
			renderSuggestions(data.suggestions || [], query);
		} catch {
			if (id === fetchId) hideSuggestions();
		}
	}

	function scheduleSuggest() {
		clearTimeout(debounceTimer);
		const q = input.value.trim();
		if (q.length < 2) {
			hideSuggestions();
			return;
		}
		debounceTimer = setTimeout(() => fetchSuggestions(q), 180);
	}

	function selectSuggestion(text) {
		input.value = text;
		hideSuggestions();
		input.blur();
		onGo(text);
	}

	input.addEventListener("input", scheduleSuggest);

	input.addEventListener("keydown", (e) => {
		if (listEl.hidden || !items.length) return;

		if (e.key === "ArrowDown") {
			e.preventDefault();
			setActive(Math.min(activeIndex + 1, items.length - 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setActive(Math.max(activeIndex - 1, 0));
		} else if (e.key === "Enter" && activeIndex >= 0) {
			e.preventDefault();
			selectSuggestion(items[activeIndex]);
		} else if (e.key === "Escape") {
			hideSuggestions();
		}
	});

	input.addEventListener("blur", () => {
		setTimeout(hideSuggestions, 150);
	});

	// Clicking anywhere else closes it straight away rather than waiting on
	// blur - which never fires if the field wasn't focused to begin with.
	document.addEventListener("pointerdown", (e) => {
		if (listEl.hidden) return;
		if (e.target === input || listEl.contains(e.target)) return;
		hideSuggestions();
	});

	input.addEventListener("focus", () => {
		if (input.value.trim().length >= 2) scheduleSuggest();
	});

	return { hideSuggestions };
}
