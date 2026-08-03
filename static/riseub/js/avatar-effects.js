const DIR = "/storage/images/avatar_effects";

/**
 * Avatar overlays, ordered from plain-and-early to loud-and-late so the
 * ladder actually feels like it's going somewhere.
 */
export const AVATAR_EFFECTS = [
	{ id: "none", label: "None", level: 1, file: null },
	{ id: "clouds", label: "Clouds", level: 4, file: "clouds.png" },
	{ id: "fall-leaves", label: "Fall Leaves", level: 8, file: "fall-leaves.png" },
	{ id: "bonsai", label: "Bonsai", level: 12, file: "bonsai.png" },
	{ id: "candle-light", label: "Candlelight", level: 17, file: "candle-light.png" },
	{ id: "feeling-cute", label: "Feeling Cute", level: 22, file: "feeling-cute.png" },
	{ id: "cat-onesie", label: "Cat Onesie", level: 27, file: "cat-onesie.png" },
	{ id: "kitten", label: "Kitten", level: 32, file: "Kitten.png" },
	{ id: "witch-hat", label: "Witch Hat", level: 38, file: "witch-hat.png" },
	{ id: "sakura-warrior", label: "Sakura Warrior", level: 44, file: "sakura-warrior.png" },
	{ id: "zombie-food", label: "Zombie Food", level: 50, file: "zombie-food.png" },
	{ id: "crossbones", label: "Crossbones", level: 56, file: "crossbones.png" },
	{ id: "fang", label: "Fang", level: 62, file: "Fang.png" },
	{ id: "twilight", label: "Twilight", level: 68, file: "twilight.png" },
	{ id: "constellations", label: "Constellations", level: 74, file: "constellations.png" },
	{ id: "astronaut", label: "Astronaut", level: 80, file: "astronaut.png" },
	{ id: "comet", label: "Comet", level: 86, file: "comet.png" },
	{ id: "soul", label: "Soul", level: 92, file: "soul.png" },
	{ id: "hexcore", label: "Hexcore", level: 100, file: "hexcore.png" },
];

export function avatarEffect(id) {
	return AVATAR_EFFECTS.find((e) => e.id === id) || AVATAR_EFFECTS[0];
}

export function avatarEffectUrl(id) {
	const effect = avatarEffect(id);
	return effect.file ? `${DIR}/${effect.file}` : null;
}

/** The overlay layer that sits on top of any avatar image. */
export function avatarOverlay(id) {
	const url = avatarEffectUrl(id);
	if (!url) return "";
	return `<span class="av-fx" style="background-image:url('${url}')" aria-hidden="true"></span>`;
}
