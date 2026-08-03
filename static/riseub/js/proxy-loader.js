const RING_LEN = 100;
/** Fast loads shouldn't flash the overlay. */
const OVERLAY_DELAY = 220;

export function initProxyLoader(root) {
	// Ids first, then classes: the split's cloned pane carries suffixed ids.
	const overlay = root.querySelector("#sj-loader") || root.querySelector(".proxy-loader");
	const ringProgress =
		root.querySelector("#sj-loader-ring-progress") ||
		root.querySelector(".proxy-loader__ring-progress");
	const bar = root.querySelector("#sj-nav-progress") || root.querySelector(".nav-progress");

	let token = 0;
	let rafId = null;
	let pumpTimer = null;
	let showTimer = null;
	let progress = 0;
	let targetProgress = 0;
	let visible = false;

	if (ringProgress) ringProgress.style.strokeDasharray = String(RING_LEN);

	function setRing(value) {
		if (!ringProgress) return;
		const clamped = Math.max(0, Math.min(100, value));
		ringProgress.style.strokeDashoffset = String(RING_LEN - clamped);
	}

	function tickProgress() {
		const delta = targetProgress - progress;
		if (Math.abs(delta) < 0.25) progress = targetProgress;
		else progress += delta * 0.08;
		setRing(progress);

		if (visible && progress < 100) rafId = requestAnimationFrame(tickProgress);
		else rafId = null;
	}

	function pumpProgress() {
		if (!visible) return;
		if (targetProgress < 88) {
			targetProgress += Math.max(0.25, (90 - targetProgress) * 0.035);
		}
		if (!rafId) rafId = requestAnimationFrame(tickProgress);
	}

	function reveal() {
		// A pane can run without an overlay of its own - the split's second
		// pane leans on its tab strip for load feedback instead.
		if (!overlay) return;
		progress = 0;
		targetProgress = 6;
		setRing(0);
		visible = true;

		overlay.hidden = false;
		overlay.classList.remove("is-hiding", "is-visible");
		// A timer, not rAF: background tabs stop painting and would stall this.
		setTimeout(() => overlay.classList.add("is-visible"), 20);

		clearInterval(pumpTimer);
		pumpTimer = setInterval(pumpProgress, 80);
		if (!rafId) rafId = requestAnimationFrame(tickProgress);
	}

	function hide() {
		return new Promise((resolve) => {
			if (!visible || !overlay) {
				visible = false;
				resolve();
				return;
			}

			const backdrop = overlay.querySelector(".proxy-loader__backdrop");
			const content = overlay.querySelector(".proxy-loader__content");

			overlay.classList.add("is-hiding");
			overlay.classList.remove("is-visible");

			let done = false;
			let pending = 0;

			const complete = () => {
				if (done) return;
				done = true;
				backdrop?.removeEventListener("transitionend", onEnd);
				content?.removeEventListener("transitionend", onEnd);
				overlay.hidden = true;
				overlay.classList.remove("is-hiding");
				visible = false;
				clearInterval(pumpTimer);
				if (rafId) cancelAnimationFrame(rafId);
				rafId = null;
				resolve();
			};

			const onEnd = (e) => {
				if (e.propertyName !== "opacity") return;
				pending -= 1;
				if (pending <= 0) complete();
			};

			if (backdrop) {
				pending += 1;
				backdrop.addEventListener("transitionend", onEnd);
			}
			if (content) {
				pending += 1;
				content.addEventListener("transitionend", onEnd);
			}
			if (pending === 0) {
				complete();
				return;
			}
			setTimeout(complete, 800);
		});
	}

	/** Begin tracking a navigation. Returns a token to hand back to `done`. */
	function start() {
		token += 1;
		bar?.classList.add("is-on");
		clearTimeout(showTimer);
		if (!visible) {
			const mine = token;
			showTimer = setTimeout(() => {
				if (mine === token) reveal();
			}, OVERLAY_DELAY);
		} else {
			progress = 0;
			targetProgress = 6;
		}
		return token;
	}

	/** Finish the navigation that `start` handed out. */
	async function done(currentToken) {
		if (currentToken !== undefined && currentToken !== token) return;
		clearTimeout(showTimer);
		bar?.classList.remove("is-on");
		if (!visible) return;

		targetProgress = 100;
		const began = performance.now();

		await new Promise((resolve) => {
			let settled = false;
			const finish = () => {
				if (settled) return;
				settled = true;
				progress = 100;
				setRing(100);
				resolve();
			};
			const waitForRing = () => {
				if (progress >= 99.5 || performance.now() - began > 600) {
					finish();
					return;
				}
				rafId = requestAnimationFrame(waitForRing);
			};
			waitForRing();
			// Guard against a throttled rAF never running the loop.
			setTimeout(finish, 700);
		});

		await hide();
	}

	function cancel() {
		token += 1;
		clearTimeout(showTimer);
		bar?.classList.remove("is-on");
		hide();
	}

	return { start, done, cancel };
}
