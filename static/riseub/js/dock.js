import { riseLogo, riseMark } from "./logo.js";
import { getProfile, onProfileChange, levelProgress, renderName } from "./profile.js";
import { avatarOverlay } from "./avatar-effects.js";
import { getPrefs, onPrefsChange } from "./theme.js";
import { renderBadgeIcons } from "./badges.js";

function esc(s) {
	const d = document.createElement("div");
	d.textContent = s == null ? "" : s;
	return d.innerHTML;
}

const ROLE_LABEL = {
	owner: "Owner",
	admin: "Admin",
	pro: "Pro",
	standard: "Standard",
	member: "Member",
};

function isVerticalTaskbar() {
	const style = getPrefs()?.taskbar;
	return style === "left" || style === "right";
}

function brandMarkup() {
	return isVerticalTaskbar()
		? riseMark({ cls: "rise-mark--dock", animate: true })
		: riseLogo();
}

/** Left-hand counterpart to the system tray: brand mark plus who you are. */
export function initDock({ onOpenProfile }) {
	const host = document.createElement("div");
	host.className = "dock";
	host.innerHTML = `
		<span class="dock__mark">${brandMarkup()}</span>
		<span class="dock__sep" aria-hidden="true"></span>
		<button type="button" class="dock__profile" data-profile></button>`;
	document.body.appendChild(host);

	const button = host.querySelector("[data-profile]");
	button.addEventListener("click", onOpenProfile);

	function syncBrand() {
		const mark = host.querySelector(".dock__mark");
		if (mark) mark.innerHTML = brandMarkup();
	}

	function render(profile) {
		if (!profile) {
			host.hidden = true;
			return;
		}
		host.hidden = false;
		syncBrand();

		const { level } = levelProgress(profile.xp);
		const role = ROLE_LABEL[profile.role] || ROLE_LABEL.member;

		button.innerHTML = `
			<span class="dock__avatar">
				${
					profile.avatar
						? `<img src="${profile.avatar}" alt="" />`
						: `<span>${esc(profile.username.slice(0, 1).toUpperCase())}</span>`
				}
				${avatarOverlay(profile.avatarEffect)}
				<span class="dock__level">${level}</span>
			</span>
			<span class="dock__who">
				<strong class="dock__name">
					${renderName(profile.username, profile.effect || "plain")}
					<span class="pf__name-badges">${renderBadgeIcons(profile, level)}</span>
				</strong>
				<span class="dock__tags">
					<span class="dock__role">${role}</span>
				</span>
			</span>`;
	}

	onPrefsChange(syncBrand);

	render(getProfile());
	onProfileChange(render);

	return { refresh: () => render(getProfile()) };
}
