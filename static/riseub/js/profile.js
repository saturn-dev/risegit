import { AVATAR_EFFECTS } from "./avatar-effects.js";
import { roleGrantIds, storeBadge } from "./badges.js";

const KEY = "riseub-profile";
const MAX_LEVEL = 100;
const XP_BASE = 40;
const XP_CURVE = 1.38;

/** Ten name treatments for the taskbar card and profile page. */
export const EFFECTS = [
	{ id: "plain", label: "Plain", level: 1, blurb: "Clean and legible." },
	{ id: "glow", label: "Soft Glow", level: 5, blurb: "A quiet halo in your accent." },
	{ id: "gradient", label: "Gradient", level: 10, blurb: "Accent bleeding into white." },
	{ id: "wave", label: "Wave", level: 16, blurb: "Letters rolling in sequence." },
	{ id: "bounce", label: "Bounce", level: 22, blurb: "Each letter hops in turn." },
	{ id: "rope", label: "Skip Rope", level: 30, blurb: "A jump that travels down the line." },
	{ id: "wobble", label: "Wobble", level: 38, blurb: "Letters swinging off their axis." },
	{ id: "ember", label: "Ember", level: 45, blurb: "Warm coals with rising sparks." },
	{ id: "tide", label: "Tide", level: 52, blurb: "Colour rolling through, letter by letter." },
	{ id: "neon", label: "Neon", level: 60, blurb: "Tube-lit, humming, occasionally faulty." },
	{ id: "comet", label: "Comet", level: 68, blurb: "A bright head dragging a tail of sparks." },
	{ id: "chrome", label: "Chrome", level: 76, blurb: "Polished metal with a moving highlight." },
	{ id: "glitch", label: "Glitch", level: 85, blurb: "Split channels, unstable signal." },
	{ id: "prism", label: "Prism", level: 100, blurb: "Full spectrum, with sparks. Earned." },
];

/** Effects that were renamed or dropped along the way. */
const EFFECT_ALIASES = {
	shimmer: "gradient",
	aurora: "tide",
	spark: "ember",
};

/** Effects that animate letter by letter need the name split up. */
const PER_LETTER = new Set([
	"wave",
	"bounce",
	"rope",
	"wobble",
	"tide",
	"comet",
	"glitch",
	"prism",
]);
const WITH_PARTICLES = new Set(["ember", "comet", "prism"]);

function escapeHtml(value) {
	return String(value == null ? "" : value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/**
 * Markup for a username under an effect. Per-letter effects get one span each
 * with its index exposed so CSS can stagger them.
 */
export function renderName(username, rawEffect = "plain") {
	const effect = EFFECTS.some((e) => e.id === rawEffect)
		? rawEffect
		: EFFECT_ALIASES[rawEffect] || "plain";
	const name = String(username || "");
	const safe = escapeHtml(name);
	const sparks = WITH_PARTICLES.has(effect)
		? `<span class="fx__sparks" aria-hidden="true">${"<i></i>".repeat(6)}</span>`
		: "";

	if (!PER_LETTER.has(effect)) {
		return `<span class="fx fx--${effect}" data-text="${safe}">${safe}${sparks}</span>`;
	}

	const letters = [...name]
		.map((char, i) => {
			if (char === " ") return `<span class="fx__sp"> </span>`;
			return `<span class="fx__l" style="--i:${i}" data-char="${escapeHtml(char)}">${escapeHtml(char)}</span>`;
		})
		.join("");

	return `<span class="fx fx--${effect} fx--split" data-text="${safe}" style="--n:${name.length}">${letters}${sparks}</span>`;
}

export const XP_EVENTS = {
	page: 6,
	track: 8,
	ai: 10,
	game: 18,
	episode: 20,
	movie: 30,
	daily: 60,
	// Ticked once per minute of actual focused use.
	focus: 4,
};

let profile = load();
const listeners = new Set();

function normalize(saved) {
	if (!saved || typeof saved !== "object") return null;
	if (saved.effect && !EFFECTS.some((e) => e.id === saved.effect)) {
		saved.effect = EFFECT_ALIASES[saved.effect] || "plain";
	}
	if (!Array.isArray(saved.badgesOwned)) saved.badgesOwned = [];
	if (!Array.isArray(saved.badgesEquipped)) saved.badgesEquipped = [];

	// Role grants (Owner → admin + pro + saturn).
	const grants = roleGrantIds(saved.role);
	for (const id of grants) {
		if (!saved.badgesOwned.includes(id)) saved.badgesOwned.push(id);
	}

	clampEffects(saved);
	return saved;
}

function clampEffects(p) {
	if (!p) return;
	const level = levelFromXp(p.xp || 0);
	const nameFx = EFFECTS.find((e) => e.id === p.effect);
	if (nameFx && nameFx.level > level) p.effect = "plain";
	const avFx = AVATAR_EFFECTS.find((e) => e.id === (p.avatarEffect || "none"));
	if (avFx && avFx.level > level) p.avatarEffect = "none";
}

function load() {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		const saved = normalize(JSON.parse(raw));
		return saved;
	} catch {}
	return null;
}

function persist() {
	try {
		localStorage.setItem(KEY, JSON.stringify(profile));
	} catch {}
}

function emit() {
	listeners.forEach((fn) => fn(profile));
}

export function onProfileChange(fn) {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

export function getProfile() {
	return profile ? { ...profile } : null;
}

export function hasProfile() {
	return !!profile;
}

// Persist role grants / badge field migrations once on boot.
if (profile) persist();

/* ── Levelling ──────────────────────────────────────────────────── */

/** Total XP needed to sit at the start of `level`. */
export function xpAtLevel(level) {
	if (level <= 1) return 0;
	return Math.round(XP_BASE * Math.pow(level - 1, XP_CURVE));
}

export function levelFromXp(xp) {
	let level = Math.floor(Math.pow(Math.max(0, xp) / XP_BASE, 1 / XP_CURVE)) + 1;
	return Math.max(1, Math.min(MAX_LEVEL, level));
}

export function levelProgress(xp) {
	const level = levelFromXp(xp);
	if (level >= MAX_LEVEL) {
		return { level, into: 0, needed: 0, ratio: 1, next: null };
	}
	const start = xpAtLevel(level);
	const next = xpAtLevel(level + 1);
	const into = xp - start;
	const needed = next - start;
	return { level, into, needed, ratio: Math.max(0, Math.min(1, into / needed)), next };
}

export function unlockedEffects(level) {
	return EFFECTS.filter((e) => e.level <= level);
}

/* ── Mutations ──────────────────────────────────────────────────── */

export function createProfile({ username, passwordHash, avatar, role = "standard" }) {
	profile = normalize({
		username,
		passwordHash,
		avatar: avatar || null,
		role: role || "standard",
		xp: 0,
		effect: "plain",
		avatarEffect: "none",
		banner: null,
		badgesOwned: [],
		badgesEquipped: [],
		stats: { pages: 0, movies: 0, episodes: 0, tracks: 0 },
		lastDaily: null,
		createdAt: Date.now(),
	});
	persist();
	emit();
	return getProfile();
}

/** Reload profile from localStorage after an import. */
export function reloadProfile() {
	profile = load();
	emit();
	return getProfile();
}

export function updateProfile(patch) {
	if (!profile) return null;
	profile = normalize({ ...profile, ...patch });
	persist();
	emit();
	return getProfile();
}

/**
 * Spend XP on a store badge. Dropping below an effect's level requirement
 * unequips that name/avatar effect automatically.
 */
export function buyBadge(badgeId) {
	if (!profile) return { ok: false, error: "No profile" };
	const badge = storeBadge(badgeId);
	if (!badge) return { ok: false, error: "Unknown badge" };
	if (profile.badgesOwned?.includes(badgeId)) {
		return { ok: false, error: "You already own that badge" };
	}
	if ((profile.xp || 0) < badge.cost) {
		return { ok: false, error: `Need ${badge.cost} XP` };
	}

	profile.xp -= badge.cost;
	profile.badgesOwned = [...(profile.badgesOwned || []), badgeId];
	clampEffects(profile);
	persist();
	emit();
	return { ok: true, xp: profile.xp, level: levelFromXp(profile.xp) };
}

export function toggleEquipBadge(badgeId) {
	if (!profile) return null;
	const owned = new Set(profile.badgesOwned || []);
	roleGrantIds(profile.role).forEach((id) => owned.add(id));
	if (!owned.has(badgeId)) return getProfile();

	const equipped = new Set(profile.badgesEquipped || []);
	if (equipped.has(badgeId)) equipped.delete(badgeId);
	else equipped.add(badgeId);
	profile.badgesEquipped = [...equipped];
	persist();
	emit();
	return getProfile();
}

export function signOut() {
	profile = null;
	try {
		localStorage.removeItem(KEY);
	} catch {}
	emit();
}

/**
 * Award XP for something the user actually did. Returns the levels gained so
 * callers can celebrate.
 */
export function awardXp(kind, amount) {
	if (!profile) return null;

	const gain = amount ?? XP_EVENTS[kind] ?? 0;
	if (!gain) return null;

	const before = levelFromXp(profile.xp);
	profile.xp += gain;

	if (profile.stats[`${kind}s`] !== undefined) profile.stats[`${kind}s`] += 1;
	else if (kind === "page") profile.stats.pages += 1;

	const after = levelFromXp(profile.xp);

	// Newly reached tiers become available but never auto-equip.
	persist();
	emit();

	return after > before ? { from: before, to: after } : null;
}

/** Once per calendar day, a small bonus for showing up. */
export function claimDaily() {
	if (!profile) return null;
	const today = new Date().toDateString();
	if (profile.lastDaily === today) return null;
	profile.lastDaily = today;
	return awardXp("daily");
}
