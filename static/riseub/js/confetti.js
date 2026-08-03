/**
 * A short burst of paper for unlock moments. Canvas-based so it can sit over
 * blurred surfaces without forcing hundreds of DOM nodes.
 */
const COLOURS = ["#7ff0c4", "#5b9dff", "#f7a8c4", "#ffd166", "#a78bfa", "#ffffff"];

export function confetti({ origin, count = 90, host = document.body } = {}) {
	if (document.documentElement.classList.contains("no-motion")) return;

	const canvas = document.createElement("canvas");
	canvas.className = "confetti-layer";
	host.appendChild(canvas);

	const ctx = canvas.getContext("2d");
	const dpr = Math.min(2, window.devicePixelRatio || 1);

	function size() {
		const rect = host.getBoundingClientRect();
		canvas.width = rect.width * dpr;
		canvas.height = rect.height * dpr;
		canvas.style.width = `${rect.width}px`;
		canvas.style.height = `${rect.height}px`;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		return rect;
	}

	const rect = size();
	const startX = origin?.x ?? rect.width / 2;
	const startY = origin?.y ?? rect.height / 2;

	const pieces = Array.from({ length: count }, () => {
		const angle = Math.random() * Math.PI * 2;
		const speed = 4 + Math.random() * 9;
		return {
			x: startX,
			y: startY,
			vx: Math.cos(angle) * speed,
			vy: Math.sin(angle) * speed - 4,
			w: 5 + Math.random() * 6,
			h: 8 + Math.random() * 8,
			spin: (Math.random() - 0.5) * 0.4,
			rot: Math.random() * Math.PI,
			colour: COLOURS[(Math.random() * COLOURS.length) | 0],
			life: 1,
		};
	});

	let raf = null;
	const started = performance.now();

	function frame(now) {
		const elapsed = now - started;
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		let alive = false;
		for (const p of pieces) {
			p.vy += 0.28;
			p.vx *= 0.99;
			p.x += p.vx;
			p.y += p.vy;
			p.rot += p.spin;
			p.life = Math.max(0, 1 - elapsed / 2200);

			if (p.life > 0 && p.y < rect.height + 40) {
				alive = true;
				ctx.save();
				ctx.globalAlpha = p.life;
				ctx.translate(p.x, p.y);
				ctx.rotate(p.rot);
				ctx.fillStyle = p.colour;
				ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
				ctx.restore();
			}
		}

		if (alive) raf = requestAnimationFrame(frame);
		else cleanup();
	}

	function cleanup() {
		if (raf) cancelAnimationFrame(raf);
		canvas.remove();
	}

	raf = requestAnimationFrame(frame);
	setTimeout(cleanup, 3000);
}
