const KEY = "riseub-history";
const MAX = 400;

let entries = load();
const listeners = new Set();

function load() {
	try {
		const raw = localStorage.getItem(KEY);
		if (raw) return JSON.parse(raw);
	} catch {}
	return [];
}

function persist() {
	try {
		localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
	} catch {}
}

function emit() {
	listeners.forEach((fn) => fn(entries));
}

export function recordVisit(url, title, favicon) {
	if (!url || !/^https?:/i.test(url)) return;

	const last = entries[0];
	// Same page again (redirect hops, title updates) - just refresh the entry.
	if (last && last.url === url) {
		last.title = title || last.title;
		if (favicon) last.favicon = favicon;
		last.at = Date.now();
	} else {
		entries.unshift({ url, title: title || url, favicon: favicon || null, at: Date.now() });
		if (entries.length > MAX) entries.length = MAX;
	}
	persist();
	emit();
}

/** Titles and icons often land a moment after the visit is recorded. */
export function updateVisitMeta(url, { title, favicon } = {}) {
	const entry = entries.find((e) => e.url === url);
	if (!entry) return;
	let changed = false;
	if (title && entry.title !== title) {
		entry.title = title;
		changed = true;
	}
	if (favicon && entry.favicon !== favicon) {
		entry.favicon = favicon;
		changed = true;
	}
	if (changed) {
		persist();
		emit();
	}
}

export function getHistory() {
	return entries.slice();
}

export function removeVisit(at) {
	entries = entries.filter((e) => e.at !== at);
	persist();
	emit();
}

export function clearHistory() {
	entries = [];
	persist();
	emit();
}

export function onHistoryChange(fn) {
	listeners.add(fn);
	return () => listeners.delete(fn);
}
