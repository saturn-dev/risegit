const STORE_DIR = "/storage/images/badges/Store";
const ROLE_DIR = "/storage/images/badges";
const LEVEL_DIR = "/storage/images/badges/Levels";

/** Store badges - bought with XP. Multiple can be equipped. */
export const STORE_BADGES = [
	{ id: "newcomer", label: "Newcomer", blurb: "Fresh boots on the ground.", cost: 40, file: "newcomer.png" },
	{ id: "music", label: "Music", blurb: "Always got something playing.", cost: 80, file: "music.png" },
	{ id: "bolt", label: "Bolt", blurb: "Quick on the draw.", cost: 120, file: "bolt.png" },
	{ id: "yin-yang", label: "Yin-Yang", blurb: "Balance in the chaos.", cost: 160, file: "yin-and-yang.png" },
	{ id: "pumpkin", label: "Pumpkin", blurb: "Seasonal mischief.", cost: 200, file: "pumpkin.png" },
	{ id: "ghost", label: "Ghost", blurb: "Here one second, gone the next.", cost: 240, file: "ghost.png" },
	{ id: "minecraft", label: "Minecraft", blurb: "Built different, block by block.", cost: 300, file: "minecraft.png" },
	{ id: "btc", label: "BTC", blurb: "Diamond hands energy.", cost: 360, file: "BTC.png" },
	{ id: "verified", label: "Verified", blurb: "The real deal.", cost: 450, file: "verified.png" },
	{ id: "overloard", label: "Overlord", blurb: "Top of the food chain.", cost: 600, file: "overloard.png" },
];

/** Role-granted badges (Owner gets all three). */
export const ROLE_BADGES = [
	{ id: "admin", label: "Admin", blurb: "Keeps the lights on.", file: "admin.png" },
	{ id: "pro", label: "Pro", blurb: "Paid-up and polished.", file: "pro.png" },
	{ id: "saturn", label: "Saturn", blurb: "Ringed and rare.", file: "saturn.png" },
];

/** Level milestones - only the highest unlocked shows. */
export const LEVEL_BADGES = [
	{ id: "lv1", label: "Level 1", blurb: "Just getting started.", level: 1, file: "1.png" },
	{ id: "lv10", label: "Level 10", blurb: "Double digits.", level: 10, file: "10.png" },
	{ id: "lv50", label: "Level 50", blurb: "Halfway legend.", level: 50, file: "50.png" },
	{ id: "lv100", label: "Level 100", blurb: "Peak Rise.", level: 100, file: "100.png" },
];

export function storeBadge(id) {
	return STORE_BADGES.find((b) => b.id === id) || null;
}

export function roleBadge(id) {
	return ROLE_BADGES.find((b) => b.id === id) || null;
}

export function badgeUrl(badge) {
	if (!badge?.file) return "";
	if (STORE_BADGES.some((b) => b.id === badge.id)) return `${STORE_DIR}/${badge.file}`;
	if (LEVEL_BADGES.some((b) => b.id === badge.id)) return `${LEVEL_DIR}/${badge.file}`;
	return `${ROLE_DIR}/${badge.file}`;
}

/** Role → free badge ids. */
export function roleGrantIds(role) {
	if (role === "owner") return ["admin", "pro", "saturn"];
	if (role === "admin") return ["admin"];
	if (role === "pro") return ["pro"];
	return [];
}

export function levelBadgeFor(level) {
	let best = LEVEL_BADGES[0];
	for (const b of LEVEL_BADGES) {
		if (level >= b.level) best = b;
	}
	return best;
}

/** Badges shown beside the name: level (auto) + equipped store/role. */
export function displayBadges(profile, level) {
	const out = [];
	const lv = levelBadgeFor(level);
	out.push({ ...lv, kind: "level", url: badgeUrl(lv) });

	const equipped = Array.isArray(profile?.badgesEquipped) ? profile.badgesEquipped : [];
	for (const id of equipped) {
		const store = storeBadge(id);
		if (store) {
			out.push({ ...store, kind: "store", url: badgeUrl(store) });
			continue;
		}
		const role = roleBadge(id);
		if (role) out.push({ ...role, kind: "role", url: badgeUrl(role) });
	}
	return out;
}

export function renderBadgeIcons(profile, level) {
	return displayBadges(profile, level)
		.map(
			(b) =>
				`<span class="pf__icon-badge" data-tip="${escapeAttr(b.label)}" title="${escapeAttr(b.label)}">
					<img src="${b.url}" alt="${escapeAttr(b.label)}" />
				</span>`
		)
		.join("");
}

function escapeAttr(s) {
	return String(s || "")
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;");
}
