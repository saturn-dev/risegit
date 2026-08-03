import { icon } from "./icons.js";
import { confirmModal, openModal } from "./modal.js";
import { notify } from "./toast.js";
import { confetti } from "./confetti.js";
import {
	EFFECTS,
	buyBadge,
	getProfile,
	levelProgress,
	onProfileChange,
	renderName,
	signOut,
	toggleEquipBadge,
	updateProfile,
} from "./profile.js";
import { AVATAR_EFFECTS, avatarEffectUrl, avatarOverlay } from "./avatar-effects.js";
import {
	LEVEL_BADGES,
	ROLE_BADGES,
	STORE_BADGES,
	badgeUrl,
	levelBadgeFor,
	renderBadgeIcons,
	roleGrantIds,
} from "./badges.js";

const AVATAR_SIZE = 256;
const BANNER_W = 900;

function esc(s) {
	const d = document.createElement("div");
	d.textContent = s == null ? "" : s;
	return d.innerHTML;
}

function since(ts) {
	const days = Math.max(1, Math.round((Date.now() - ts) / 86400000));
	if (days < 30) return `${days} day${days === 1 ? "" : "s"}`;
	const months = Math.round(days / 30);
	if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
	return `${Math.round(months / 12)} year${months >= 24 ? "s" : ""}`;
}

/** Read a picked file down to a sensible size. */
function readImage(file, { width, height }) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(new Error("Could not read that file"));
		reader.onload = () => {
			const image = new Image();
			image.onerror = () => reject(new Error("That file isn't an image"));
			image.onload = () => {
				const canvas = document.createElement("canvas");
				canvas.width = width;
				canvas.height = height;
				const ctx = canvas.getContext("2d");
				const scale = Math.max(width / image.width, height / image.height);
				const w = image.width * scale;
				const h = image.height * scale;
				ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
				resolve(canvas.toDataURL("image/webp", 0.85));
			};
			image.src = reader.result;
		};
		reader.readAsDataURL(file);
	});
}

function pickFile(accept = "image/*") {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = accept;
		input.onchange = () => resolve(input.files?.[0] || null);
		input.click();
	});
}

/** The profile lives in a centred dialog, same furniture as every other popup. */
export function openProfileModal() {
	let tab = "name";

	const holder = document.createElement("div");
	const modal = openModal({
		title: "Profile",
		subtitle: "Everything here is stored on this device.",
		size: "lg",
		body: holder,
	});

	function render() {
		const p = getProfile();
		if (!p) {
			holder.innerHTML = `<p class="media-empty">No profile on this device.</p>`;
			return;
		}

		const { level, into, needed, ratio } = levelProgress(p.xp);
		const stats = p.stats || {};
		const overlay = avatarOverlay(p.avatarEffect);

		holder.innerHTML = `
			<div class="pf">
				<div class="pf__banner" data-banner style="${
					p.banner ? `background-image:url('${p.banner}')` : ""
				}">
					<span class="pf__banner-fade"></span>
					<button type="button" class="pf__edit pf__edit--banner" data-edit-banner>
						${icon("pencil")}<span>Banner</span>
					</button>
				</div>

				<div class="pf__id">
					<button type="button" class="pf__avatar" data-edit-avatar aria-label="Change picture">
						${
							p.avatar
								? `<img src="${p.avatar}" alt="" />`
								: `<span class="pf__initial">${esc(p.username.slice(0, 1).toUpperCase())}</span>`
						}
						${overlay}
						<span class="pf__avatar-edit">${icon("pencil")}</span>
					</button>

					<div class="pf__who">
						<h2 class="pf__name">
							${renderName(p.username, p.effect || "plain")}
							<span class="pf__name-badges">${renderBadgeIcons(p, level)}</span>
						</h2>
						<div class="pf__badges">
							<span class="pf__badge pf__badge--role">${esc(roleLabel(p.role))}</span>
							<span class="pf__badge">Level ${level}</span>
							<span class="pf__badge">${(p.xp || 0).toLocaleString()} XP</span>
						</div>
					</div>
				</div>

				<div class="pf__xp">
					<div class="pf__xp-bar"><span style="width:${(ratio * 100).toFixed(1)}%"></span></div>
					<p>${
						needed
							? `${into.toLocaleString()} / ${needed.toLocaleString()} to level ${level + 1}`
							: "Max level"
					}</p>
				</div>

				<div class="pf__stats">
					${stat("globe", stats.pages || 0, "Pages")}
					${stat("film", stats.movies || 0, "Movies")}
					${stat("layers", stats.episodes || 0, "Episodes")}
					${stat("music", stats.tracks || 0, "Tracks")}
					${stat("gamepad", stats.games || 0, "Games")}
					${stat("clock", since(p.createdAt), "Here for")}
				</div>

				<div class="pf__tabs" data-tabs>
					<span class="pf__tabs-pill" data-tabs-pill aria-hidden="true"></span>
					<button type="button" class="pf__tab${tab === "name" ? " on" : ""}" data-tab="name">Name effects</button>
					<button type="button" class="pf__tab${tab === "avatar" ? " on" : ""}" data-tab="avatar">Avatar effects</button>
					<button type="button" class="pf__tab${tab === "badges" ? " on" : ""}" data-tab="badges">Badges</button>
				</div>

				<div class="${tab === "badges" ? "badge-panes" : "unlock-grid"}" data-unlock-grid>
					${tabGrid(tab, p, level)}
				</div>

				<div class="pf__foot">
					<button type="button" class="btn-line btn-line--danger" data-signout>${icon("x")}Sign out</button>
				</div>
			</div>`;

		bind();
	}

	function stat(name, value, label) {
		return `
			<div class="pf__stat">
				<span>${icon(name)}</span>
				<strong>${esc(String(value))}</strong>
				<span>${esc(label)}</span>
			</div>`;
	}

	function nameCard(item, profile, level) {
		const locked = level < item.level;
		const active = profile.effect === item.id;
		return `
			<button type="button" class="unlock-card${locked ? " is-locked" : ""}${active ? " is-active" : ""}"
				data-effect="${item.id}" ${locked ? "disabled" : ""}>
				<span class="unlock-card__preview">${renderName(profile.username, item.id)}</span>
				<span class="unlock-card__meta"><strong>${esc(item.label)}</strong></span>
				<span class="unlock-card__state">${
					locked
						? `<span class="unlock-card__lock">Lv ${item.level}</span>`
						: active
							? icon("check")
							: `<span class="unlock-card__use">Use</span>`
				}</span>
			</button>`;
	}

	function avatarCard(item, profile, level) {
		const locked = level < item.level;
		const active = (profile.avatarEffect || "none") === item.id;
		const url = avatarEffectUrl(item.id);
		return `
			<button type="button" class="unlock-card${locked ? " is-locked" : ""}${active ? " is-active" : ""}"
				data-avatar-effect="${item.id}" ${locked ? "disabled" : ""}>
				<span class="unlock-card__preview">
					<span class="av-preview">
						${
							profile.avatar
								? `<img src="${profile.avatar}" alt="" />`
								: `<span class="pf__initial">${esc(profile.username.slice(0, 1).toUpperCase())}</span>`
						}
						${url ? `<span class="av-fx" style="background-image:url('${url}')"></span>` : ""}
					</span>
				</span>
				<span class="unlock-card__meta"><strong>${esc(item.label)}</strong></span>
				<span class="unlock-card__state">${
					locked
						? `<span class="unlock-card__lock">Lv ${item.level}</span>`
						: active
							? icon("check")
							: `<span class="unlock-card__use">Use</span>`
				}</span>
			</button>`;
	}

	function roleLabel(role) {
		return (
			{ owner: "Owner", admin: "Admin", pro: "Pro", standard: "Standard", member: "Member" }[
				role
			] || "Member"
		);
	}

	function tabGrid(which, p, level) {
		if (which === "name") return EFFECTS.map((fx) => nameCard(fx, p, level)).join("");
		if (which === "avatar") return AVATAR_EFFECTS.map((fx) => avatarCard(fx, p, level)).join("");
		return badgesPane(p, level);
	}

	function badgesPane(p, level) {
		const owned = new Set([...(p.badgesOwned || []), ...roleGrantIds(p.role)]);
		const equipped = new Set(p.badgesEquipped || []);
		const currentLevelBadge = levelBadgeFor(level);

		const levelCards = LEVEL_BADGES.map((b) => {
			const unlocked = level >= b.level;
			const active = currentLevelBadge.id === b.id;
			return `
				<div class="unlock-card unlock-card--badge${unlocked ? "" : " is-locked"}${active ? " is-active" : ""}">
					<span class="unlock-card__preview">
						<img class="badge-preview" src="${badgeUrl(b)}" alt="" />
					</span>
					<span class="unlock-card__meta"><strong>${esc(b.label)}</strong></span>
					<span class="unlock-card__state">${
						!unlocked
							? `<span class="unlock-card__lock">Lv ${b.level}</span>`
							: active
								? `<span class="unlock-card__use">Showing</span>`
								: `<span class="unlock-card__use">Auto</span>`
					}</span>
				</div>`;
		}).join("");

		const roleCards = ROLE_BADGES.map((b) => {
			const has = owned.has(b.id);
			const on = equipped.has(b.id);
			return `
				<button type="button" class="unlock-card unlock-card--badge${has ? "" : " is-locked"}${on ? " is-active" : ""}"
					data-equip-badge="${b.id}" ${has ? "" : "disabled"}>
					<span class="unlock-card__preview">
						<img class="badge-preview" src="${badgeUrl(b)}" alt="" />
					</span>
					<span class="unlock-card__meta"><strong>${esc(b.label)}</strong></span>
					<span class="unlock-card__state">${
						!has
							? `<span class="unlock-card__lock">Role</span>`
							: on
								? icon("check")
								: `<span class="unlock-card__use">Equip</span>`
					}</span>
				</button>`;
		}).join("");

		const storeCards = STORE_BADGES.map((b) => {
			const has = owned.has(b.id);
			const on = equipped.has(b.id);
			const canBuy = !has && (p.xp || 0) >= b.cost;
			return `
				<button type="button" class="unlock-card unlock-card--badge${has || canBuy ? "" : " is-locked"}${on ? " is-active" : ""}"
					data-store-badge="${b.id}" ${has || canBuy ? "" : "disabled"}>
					<span class="unlock-card__preview">
						<img class="badge-preview" src="${badgeUrl(b)}" alt="" />
					</span>
					<span class="unlock-card__meta"><strong>${esc(b.label)}</strong></span>
					<span class="unlock-card__state">${
						has
							? on
								? icon("check")
								: `<span class="unlock-card__use">Equip</span>`
							: `<span class="unlock-card__lock">${b.cost} XP</span>`
					}</span>
				</button>`;
		}).join("");

		return `
			<div class="badge-section" style="grid-column:1/-1">
				<h3 class="badge-section__title">Level</h3>
				<p class="badge-section__sub">Highest milestone replaces the last - you always show one.</p>
				<div class="unlock-grid unlock-grid--badges">${levelCards}</div>
			</div>
			<div class="badge-section" style="grid-column:1/-1">
				<h3 class="badge-section__title">Role</h3>
				<p class="badge-section__sub">Owner unlocks Admin, Pro, and Saturn. Equip any you own.</p>
				<div class="unlock-grid unlock-grid--badges">${roleCards}</div>
			</div>
			<div class="badge-section" style="grid-column:1/-1">
				<h3 class="badge-section__title">Store</h3>
				<p class="badge-section__sub">Spend XP (not levels). Dropping below an effect’s level unequips it.</p>
				<div class="unlock-grid unlock-grid--badges">${storeCards}</div>
			</div>`;
	}

	function syncTabPill() {
		const tabs = holder.querySelector("[data-tabs]");
		const pill = holder.querySelector("[data-tabs-pill]");
		const on = holder.querySelector(".pf__tab.on");
		if (!tabs || !pill || !on) return;
		const t = tabs.getBoundingClientRect();
		const b = on.getBoundingClientRect();
		pill.style.width = `${b.width}px`;
		pill.style.transform = `translateX(${b.left - t.left}px)`;
	}

	function bindUnlockCards() {
		holder.querySelectorAll("[data-effect]").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				const fresh = getProfile()?.effect !== btn.dataset.effect;
				updateProfile({ effect: btn.dataset.effect });
				if (fresh) celebrate(e.currentTarget);
				render();
			});
		});

		holder.querySelectorAll("[data-avatar-effect]").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				const fresh = (getProfile()?.avatarEffect || "none") !== btn.dataset.avatarEffect;
				updateProfile({ avatarEffect: btn.dataset.avatarEffect });
				if (fresh) celebrate(e.currentTarget);
				render();
			});
		});

		holder.querySelectorAll("[data-equip-badge]").forEach((btn) => {
			btn.addEventListener("click", () => {
				toggleEquipBadge(btn.dataset.equipBadge);
				render();
			});
		});

		holder.querySelectorAll("[data-store-badge]").forEach((btn) => {
			btn.addEventListener("click", () => {
				const id = btn.dataset.storeBadge;
				const p = getProfile();
				if (p?.badgesOwned?.includes(id) || roleGrantIds(p?.role).includes(id)) {
					toggleEquipBadge(id);
					render();
					return;
				}
				const result = buyBadge(id);
				if (!result.ok) {
					notify("Can't buy", result.error || "Not enough XP", "error");
					return;
				}
				notify("Badge unlocked", `Spent XP - now level ${result.level}`, "success");
				toggleEquipBadge(id);
				render();
			});
		});
	}

	function switchTab(next) {
		if (next === tab) return;
		const p = getProfile();
		if (!p) return;
		const { level } = levelProgress(p.xp);
		tab = next;

		holder.querySelectorAll("[data-tab]").forEach((btn) => {
			btn.classList.toggle("on", btn.dataset.tab === tab);
		});

		const grid = holder.querySelector("[data-unlock-grid]");
		if (grid) {
			grid.className = tab === "badges" ? "badge-panes" : "unlock-grid";
			grid.innerHTML = tabGrid(tab, p, level);
			bindUnlockCards();
		}
		requestAnimationFrame(syncTabPill);
	}

	/** Paper burst from the card you just equipped. */
	function celebrate(card) {
		const modalEl = holder.closest(".modal");
		if (!modalEl) return;
		const box = modalEl.getBoundingClientRect();
		const spot = card.getBoundingClientRect();
		confetti({
			host: modalEl,
			origin: {
				x: spot.left - box.left + spot.width / 2,
				y: spot.top - box.top + spot.height / 2,
			},
		});
	}

	function bind() {
		holder.querySelectorAll("[data-tab]").forEach((btn) => {
			btn.addEventListener("click", () => switchTab(btn.dataset.tab));
		});
		requestAnimationFrame(() => {
			syncTabPill();
			requestAnimationFrame(syncTabPill);
		});

		bindUnlockCards();

		holder.querySelector("[data-edit-avatar]")?.addEventListener("click", async () => {
			const file = await pickFile();
			if (!file) return;
			try {
				const avatar = await readImage(file, { width: AVATAR_SIZE, height: AVATAR_SIZE });
				updateProfile({ avatar });
				render();
			} catch (e) {
				notify("Couldn't use that image", e.message, "error");
			}
		});

		holder.querySelector("[data-edit-banner]")?.addEventListener("click", async () => {
			const file = await pickFile();
			if (!file) return;
			try {
				const banner = await readImage(file, { width: BANNER_W, height: 300 });
				updateProfile({ banner });
				render();
			} catch (e) {
				notify("Couldn't use that image", e.message, "error");
			}
		});

		holder.querySelector("[data-signout]")?.addEventListener("click", async () => {
			const ok = await confirmModal({
				title: "Sign out?",
				subtitle:
					"Your profile, level and unlocks go with it, and you'll need the token again.",
				confirmText: "Sign out",
				danger: true,
			});
			if (!ok) return;
			signOut();
			location.href = "/";
		});
	}

	render();
	const stop = onProfileChange(render);
	const originalClose = modal.close;
	modal.close = () => {
		stop();
		originalClose();
	};

	return modal;
}

/** Kept for the /profile route - it just opens the dialog. */
export function initProfilePage(root) {
	const el = document.createElement("div");
	el.className = "profile-page profile-page--redirect";
	root.appendChild(el);

	openProfileModal();

	return {
		refresh: () => {},
		destroy: () => el.remove(),
	};
}
