/**
 * Tiny bridge so the taskbar mini player can drive the music page without the
 * two modules importing each other.
 */
let api = null;
let state = { playing: false, track: null, position: 0, duration: 0, volume: 1 };
const listeners = new Set();

export function registerPlayer(next) {
	api = next;
}

export function getPlayer() {
	return api;
}

export function publishState(next) {
	state = { ...state, ...next };
	listeners.forEach((fn) => fn(state));
}

export function getState() {
	return state;
}

export function onPlayerState(fn) {
	listeners.add(fn);
	fn(state);
	return () => listeners.delete(fn);
}
