import { icon } from "./icons.js";
import { notify } from "./toast.js";
import { renderMarkdown } from "./markdown.js";
import { ensureUtilityFrame, proxify } from "./scramjet-shell.js";

/** Same think-tag split used by the main AI chat (kept local to avoid import cycles). */
function splitThinking(raw) {
	const text = String(raw || "");
	const openRe = /<\s*think\s*>/i;
	const closeRe = /<\s*\/\s*think\s*>/i;
	const open = text.search(openRe);
	if (open < 0) {
		return { thinking: "", answer: text, thinkingDone: true, hasThink: false };
	}
	const before = text.slice(0, open).trim();
	const afterOpen = text.slice(open).replace(openRe, "");
	const close = afterOpen.search(closeRe);
	if (close < 0) {
		return { thinking: afterOpen.trim(), answer: before, thinkingDone: false, hasThink: true };
	}
	const thinking = afterOpen.slice(0, close).trim();
	const answer = [before, afterOpen.slice(close).replace(closeRe, "").trim()]
		.filter(Boolean)
		.join("\n\n");
	return { thinking, answer, thinkingDone: true, hasThink: true };
}

/**
 * Reason first, then answer briefly. The previous prompt banned working out,
 * which is exactly how it got multiple-choice questions wrong.
 */
const SYSTEM = [
	"You are reading a screenshot of the user's screen.",
	"Work the problem out properly before you answer - do the algebra, check",
	"each option against what you derived, and discard the ones that",
	"contradict it. For polynomial end behaviour, find the degree and the sign",
	"of the leading coefficient first: even degree with a negative leading",
	"coefficient falls on both ends, even with positive rises on both, odd",
	"degree goes opposite ways.",
	"Then reply with the answer and one short line of justification -",
	"about 40 words. Write math in LaTeX using \\( \\) and \\frac{}{}.",
].join(" ");

const THEME_VARS = [
	"--accent",
	"--accent-hi",
	"--accent-deep",
	"--accent-rgb",
	"--accent-ink",
	"--accent-low",
	"--accent-mid",
	"--accent-glow",
	"--bg",
	"--bg-2",
	"--text",
	"--text-dim",
	"--text-mute",
	"--line",
	"--line-2",
	"--surface",
	"--surface-2",
	"--glass",
	"--shell",
];

let session = null;

function esc(s) {
	const d = document.createElement("div");
	d.textContent = s == null ? "" : s;
	return d.innerHTML;
}

function friendlyAiError(raw) {
	let msg = typeof raw === "string" ? raw : raw?.message || "";
	try {
		const parsed = JSON.parse(msg);
		msg = parsed?.error?.message || parsed?.message || msg;
	} catch {}
	if (/request too large|tokens per minute|\bTPM\b|reduce your message size/i.test(msg)) {
		return "Character limit exceeded";
	}
	if (/model_not_found|does not exist or you do not have access/i.test(msg)) {
		return "That model isn't available. Try again in a moment.";
	}
	return msg;
}

/**
 * Live screen share with an ask-bar. The frame is grabbed at the moment you
 * send, never before, so the answer always matches what's on screen now.
 */
export async function startScreenShare() {
	if (session) {
		session.focus();
		return session;
	}

	let stream;
	try {
		stream = await navigator.mediaDevices.getDisplayMedia({
			// Ask for the panel's native resolution - small text has to survive
			// the round trip for the model to read it.
			video: {
				frameRate: 10,
				width: { ideal: 2560 },
				height: { ideal: 1440 },
			},
			audio: false,
			selfBrowserSurface: "include",
		});

		// Grab the full-resolution track where the browser allows it.
		try {
			const track = stream.getVideoTracks()[0];
			const caps = track.getCapabilities?.();
			if (caps?.width?.max) {
				await track.applyConstraints({
					width: { ideal: caps.width.max },
					height: { ideal: caps.height?.max },
				});
			}
		} catch {}
	} catch {
		return null;
	}

	const video = document.createElement("video");
	video.muted = true;
	video.autoplay = true;
	video.playsInline = true;
	video.srcObject = stream;
	await video.play().catch(() => {});

	const surface = await openSurface();
	const doc = surface.doc;
	const root = surface.root;

	root.className = "ss";
	root.innerHTML = `
		<div class="ss__bar">
			<span class="ss__live"><i></i>LIVE</span>
			<span class="ss__cam">${icon("monitor")}</span>
			<input class="ss__input" placeholder="Ask about your screen…" aria-label="Ask about your screen" />
			<button class="ss__btn ss__send" data-send aria-label="Ask">${icon("arrowRight")}</button>
			<button class="ss__btn" data-min aria-label="Collapse">${icon("chevronUp")}</button>
			<button class="ss__btn ss__close" data-close aria-label="Stop sharing">${icon("x")}</button>
		</div>
		<div class="ss__feed" data-feed></div>`;

	const input = root.querySelector(".ss__input");
	const feed = root.querySelector("[data-feed]");
	let busy = false;

	/**
	 * Full-resolution grab up to 2048px wide - that's the largest tile the
	 * vision models use, so anything beyond it is wasted bytes.
	 */
	function capture() {
		if (!video.videoWidth) return null;
		const canvas = doc.createElement("canvas");
		const scale = Math.min(1, 2048 / video.videoWidth);
		canvas.width = Math.round(video.videoWidth * scale);
		canvas.height = Math.round(video.videoHeight * scale);

		const ctx = canvas.getContext("2d");
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "high";
		ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

		// PNG keeps text crisp; fall back to high-quality JPEG if it's huge.
		const png = canvas.toDataURL("image/png");
		if (png.length < 3_800_000) return png;
		return canvas.toDataURL("image/jpeg", 0.92);
	}

	function addCard(shot, question) {
		const card = doc.createElement("article");
		card.className = "ss__card";
		card.innerHTML = `
			<div class="ss__main">
				<p class="ss__q">${esc(question)}</p>
				<div class="ss__think is-live" data-think>
					<span class="ss__think-orb" aria-hidden="true"></span>
					<span class="ss__think-label">Thinking</span>
				</div>
				<div class="ss__a" data-answer></div>
			</div>
			<div class="ss__shot"><img src="${shot}" alt="" /></div>`;
		feed.prepend(card);
		while (feed.children.length > 4) feed.lastElementChild.remove();
		return card;
	}

	function paintCard(card, raw, { done = false, error = false } = {}) {
		const think = card.querySelector("[data-think]");
		const answerEl = card.querySelector("[data-answer]");
		const parts = splitThinking(raw);
		let answer = parts.answer.trim();
		// Models sometimes leave the whole reply inside think tags.
		if (done && !answer && parts.thinking) answer = parts.thinking.trim();

		if (think) {
			if (parts.hasThink && parts.thinking && parts.thinking !== answer) {
				think.hidden = false;
				think.classList.toggle("is-live", !parts.thinkingDone && !done);
				think.classList.toggle("is-done", parts.thinkingDone || done);
				const label = think.querySelector(".ss__think-label");
				if (label) label.textContent = parts.thinkingDone || done ? "Thought" : "Thinking";
				think.title = parts.thinking;
			} else if (done || answer) {
				think.hidden = true;
			} else {
				think.hidden = false;
				think.classList.add("is-live");
				think.classList.remove("is-done");
			}
		}

		if (answerEl) {
			if (error) {
				answerEl.innerHTML = `<p class="is-error">${esc(raw)}</p>`;
				answerEl.classList.add("is-error");
			} else if (answer) {
				answerEl.innerHTML = renderMarkdown(answer);
				answerEl.classList.add("is-in");
				answerEl.classList.remove("is-error");
			} else if (done) {
				answerEl.innerHTML = `<p>No answer came back.</p>`;
			}
		}
	}

	async function ask() {
		if (busy) return;
		const question = input.value.trim() || "What am I looking at?";
		const shot = capture();
		if (!shot) {
			notify("Nothing captured yet", "The shared screen hasn't sent a frame", "error");
			return;
		}

		busy = true;
		input.value = "";
		root.classList.remove("is-min");
		const card = addCard(shot, question);

		try {
			const payload = {
				model: "gpt-4o-mini",
				messages: [
					{
						role: "user",
						content: [
							{ type: "text", text: `${SYSTEM}\n\nQ: ${question}` },
							{ type: "image_url", image_url: { url: shot } },
						],
					},
				],
			};

			async function openStream() {
				try {
					await ensureUtilityFrame();
					const bridgeRes = await fetch("/api/ai/bridge", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(payload),
					});
					const bridge = await bridgeRes.json().catch(() => ({}));
					if (!bridgeRes.ok) {
						throw new Error(bridge.error || "Bridge failed");
					}
					const upstream = await fetch(proxify(bridge.url), {
						method: "POST",
						headers: bridge.headers,
						body: JSON.stringify(bridge.body),
					});
					if (upstream.ok) return upstream;
				} catch {
					/* fall through */
				}
				return fetch("/api/ai/chat", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});
			}

			const res = await openStream();

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(friendlyAiError(data.error) || `Request failed (${res.status})`);
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			let answerBuf = "";
			let thinkBuf = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) {
					const t = line.trim();
					if (!t.startsWith("data:")) continue;
					const payload = t.slice(5).trim();
					if (!payload || payload === "[DONE]") continue;
					try {
						const delta = JSON.parse(payload).choices?.[0]?.delta || {};
						const reasoning = delta.reasoning || delta.reasoning_content || "";
						const content = delta.content || "";
						if (reasoning) thinkBuf += reasoning;
						if (content) answerBuf += content;
						if (!reasoning && !content) continue;
						const raw = thinkBuf ? `<think>${thinkBuf}</think>\n${answerBuf}` : answerBuf;
						paintCard(card, raw);
					} catch {}
				}
			}

			const raw = thinkBuf ? `<think>${thinkBuf}</think>\n${answerBuf}` : answerBuf;
			paintCard(card, raw, { done: true });
		} catch (err) {
			paintCard(card, err.message, { done: true, error: true });
		} finally {
			busy = false;
		}
	}

	root.querySelector("[data-send]").addEventListener("click", ask);
	root.querySelector("[data-min]").addEventListener("click", (e) => {
		root.classList.toggle("is-min");
		e.currentTarget.classList.toggle("is-flipped");
	});
	root.querySelector("[data-close]").addEventListener("click", stop);
	input.addEventListener("keydown", (e) => {
		if (e.key === "Enter") ask();
	});

	stream.getVideoTracks()[0].addEventListener("ended", stop);

	function stop() {
		stream.getTracks().forEach((t) => t.stop());
		surface.close();
		session = null;
		window.dispatchEvent(new CustomEvent("riseub:screenshare", { detail: false }));
	}

	session = { stop, focus: surface.focus, ask };
	window.dispatchEvent(new CustomEvent("riseub:screenshare", { detail: true }));
	setTimeout(() => input.focus(), 200);
	return session;
}

export function stopScreenShare() {
	session?.stop();
}

export function isSharing() {
	return !!session;
}

async function openSurface() {
	let win = null;
	try {
		if (window.documentPictureInPicture?.requestWindow) {
			win = await window.documentPictureInPicture.requestWindow({
				width: 660,
				height: 260,
			});
		}
	} catch {
		win = null;
	}

	if (win) {
		copyStyles(win.document);
		const root = win.document.createElement("div");
		win.document.body.appendChild(root);

		const onPrefs = () => syncTheme(win.document);
		window.addEventListener("riseub:prefs", onPrefs);
		const observer = new MutationObserver(onPrefs);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-theme", "style", "class"],
		});

		return {
			doc: win.document,
			root,
			close: () => {
				window.removeEventListener("riseub:prefs", onPrefs);
				observer.disconnect();
				try {
					win.close();
				} catch {}
			},
			focus: () => {
				try {
					win.focus();
				} catch {}
			},
		};
	}

	const holder = document.createElement("div");
	holder.className = "ss-inline";
	document.body.appendChild(holder);
	return {
		doc: document,
		root: holder,
		close: () => holder.remove(),
		focus: () => holder.scrollIntoView({ block: "nearest" }),
	};
}

function syncTheme(doc) {
	if (!doc?.documentElement) return;
	const from = document.documentElement;
	doc.documentElement.dataset.theme = from.dataset.theme || "";

	const cs = getComputedStyle(from);
	for (const name of THEME_VARS) {
		const value = (from.style.getPropertyValue(name) || cs.getPropertyValue(name)).trim();
		if (value) doc.documentElement.style.setProperty(name, value);
		else doc.documentElement.style.removeProperty(name);
	}
}

function copyStyles(doc) {
	[...document.styleSheets].forEach((sheet) => {
		try {
			const css = [...sheet.cssRules].map((r) => r.cssText).join("");
			const style = doc.createElement("style");
			style.textContent = css;
			doc.head.appendChild(style);
		} catch {
			if (sheet.href) {
				const link = doc.createElement("link");
				link.rel = "stylesheet";
				link.href = sheet.href;
				doc.head.appendChild(link);
			}
		}
	});

	syncTheme(doc);
	const base = doc.createElement("style");
	base.textContent = `html,body{margin:0;height:100%;background:var(--bg,#0a0c0b);
		color:var(--text,#f2f4f5);font-family:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
		overflow:hidden}`;
	doc.head.appendChild(base);
}
