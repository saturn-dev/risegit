import { icon } from "./icons.js";
import { renderMarkdown } from "./markdown.js";
import { riseLogo } from "./logo.js";
import { notify } from "./toast.js";
import { confirmModal, contextMenu, promptModal, openModal } from "./modal.js";
import { dropdown, actionMenu } from "./dropdown.js";
import { startScreenShare, stopScreenShare, isSharing } from "./screenshare.js";
import { readAccessToken } from "./save-vault.js";

/**
 * The AI routes spend real money, so the server wants the invite token back.
 * Cached after the first unseal - it never changes within a session.
 */
let cachedToken = null;

async function aiHeaders(extra = {}) {
	if (cachedToken === null) {
		cachedToken = (await readAccessToken().catch(() => null))?.token || "";
	}
	return cachedToken
		? { ...extra, "X-Rise-Token": cachedToken }
		: { ...extra };
}

const CHATS_KEY = "riseub-ai-chats";
const MODEL_KEY = "riseub-ai-model";
const MAX_TURNS = 120;
/** How much history actually goes to the model. */
const SEND_TURNS = 36;
/** Anything longer than this becomes an attachment instead of inline text. */
const STREAM_FRAME = 90;
const LONG_PASTE = 5000;

const STARTERS = [
	{ label: "Explain simply", prompt: "Explain this simply: " },
	{ label: "Translate to…", prompt: "Translate this to Spanish: " },
	{ label: "Pros and cons", prompt: "Give me the pros and cons of " },
	{ label: "Study guide", prompt: "Make a study guide for " },
];

const STUDY_PROMPT =
	"Study mode: teach step by step. Offer quizzes and flashcards, ask a " +
	"follow-up question after each explanation, and keep answers tight.";

function esc(s) {
	const d = document.createElement("div");
	d.textContent = s == null ? "" : s;
	return d.innerHTML;
}

function uid() {
	return `c${Date.now().toString(36)}${Math.random().toString(16).slice(2, 6)}`;
}

function getPreferredVoice() {
	const voices = window.speechSynthesis?.getVoices?.() || [];
	const asianEnglishFemale = voices.filter(
		(v) =>
			v.lang.startsWith("en") &&
			/(asian|chinese|japanese|korean)/i.test(v.name) &&
			/female/i.test(v.name)
	);
	if (asianEnglishFemale.length) return asianEnglishFemale[0];
	const englishFemale = voices.filter(
		(v) => v.lang.startsWith("en") && /female/i.test(v.name)
	);
	if (englishFemale.length) return englishFemale[0];
	const asianFemale = voices.filter(
		(v) => /^(zh|ja|ko|th|vi)/i.test(v.lang) && /female/i.test(v.name)
	);
	if (asianFemale.length) return asianFemale[0];
	const englishVoices = voices.filter((v) => v.lang.startsWith("en"));
	if (englishVoices.length) return englishVoices[0];
	return voices[0] || null;
}

/** Pull Claude-style `<think>` blocks out of a streamed reply. */
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
		return {
			thinking: afterOpen.trim(),
			answer: before,
			thinkingDone: false,
			hasThink: true,
		};
	}

	const thinking = afterOpen.slice(0, close).trim();
	const answer = [before, afterOpen.slice(close).replace(closeRe, "").trim()]
		.filter(Boolean)
		.join("\n\n");
	return { thinking, answer, thinkingDone: true, hasThink: true };
}

function speakText(text, voice, rate, pitch, onEnd, isLive) {
	const clean = splitThinking(text).answer || String(text || "");
	const maxChunkLength = 300;
	const chunks = [];
	let currentChunk = "";
	const sentences = clean.split(/(?<=[.?!])\s+/).filter(Boolean);

	for (let sentence of sentences) {
		if ((currentChunk + sentence).length > maxChunkLength) {
			if (currentChunk) {
				chunks.push(currentChunk);
				currentChunk = sentence;
			} else {
				while (sentence.length > maxChunkLength) {
					chunks.push(sentence.slice(0, maxChunkLength));
					sentence = sentence.slice(maxChunkLength);
				}
				currentChunk = sentence;
			}
		} else {
			currentChunk += (currentChunk ? " " : "") + sentence;
		}
	}
	if (currentChunk) chunks.push(currentChunk);
	if (!chunks.length) {
		onEnd?.();
		return;
	}

	let currentIndex = 0;
	function speakNext() {
		if (isLive && !isLive()) return;
		if (currentIndex >= chunks.length) {
			onEnd?.();
			return;
		}
		const utterance = new SpeechSynthesisUtterance(chunks[currentIndex]);
		if (voice) utterance.voice = voice;
		utterance.rate = rate;
		utterance.pitch = pitch;
		utterance.onend = () => {
			currentIndex++;
			speakNext();
		};
		utterance.onerror = () => {
			currentIndex++;
			speakNext();
		};
		try {
			window.speechSynthesis.speak(utterance);
		} catch {
			onEnd?.();
		}
	}
	speakNext();
}

function msgText(msg) {
	if (msg.prompt != null && msg.role === "user") return msg.prompt;
	if (Array.isArray(msg.content)) {
		return msg.content
			.filter((p) => p.type === "text")
			.map((p) => p.text)
			.join("\n\n");
	}
	return String(msg.content || "");
}

function userPromptOf(msg) {
	if (msg.prompt != null) return msg.prompt;
	if (Array.isArray(msg.content)) {
		const texts = msg.content.filter((p) => p.type === "text");
		const prompt = texts.find((p) => !String(p.text).startsWith("Attached document:"));
		return prompt?.text || texts[texts.length - 1]?.text || "";
	}
	return String(msg.content || "");
}

function userImagesOf(msg) {
	if (!Array.isArray(msg.content)) return [];
	return msg.content
		.filter((p) => p.type === "image_url")
		.map((p) => p.image_url?.url)
		.filter(Boolean);
}

function userTextAttsOf(msg) {
	if (!Array.isArray(msg.content)) return [];
	return msg.content
		.filter((p) => p.type === "text" && String(p.text).startsWith("Attached document:"))
		.map((p, i) => ({
			name: `Attached text ${i + 1}`,
			data: String(p.text).replace(/^Attached document:\n?/, ""),
		}));
}

function flattenContent(content) {
	if (!Array.isArray(content)) return String(content || "");
	const texts = content.filter((p) => p.type === "text").map((p) => p.text);
	return texts.join("\n\n") || "(image)";
}

export function initAi(root, { ensureScramjet, proxify } = {}) {
	let chats = loadChats();
	let activeId = chats[0]?.id || null;
	let models = [];
	let model = localStorage.getItem(MODEL_KEY) || "";
	let configured = true;
	let streaming = false;
	let abort = null;
	let attachments = [];
	let webSearch = false;
	let studyMode = false;
	let filter = "";
	let speakingIndex = null;
	let speakGen = 0;

	const md = (text, opts = {}) =>
		renderMarkdown(text, { ...opts, proxify: proxify || undefined });

	ensureScramjet?.().catch(() => {});

	// Warm voices for TTS - some browsers load them async.
	// Do not speak or cancel here; voiceschanged mid-utterance can restart audio.
	try {
		window.speechSynthesis?.getVoices?.();
		window.speechSynthesis?.addEventListener?.("voiceschanged", () => {
			window.speechSynthesis.getVoices();
		});
	} catch {}

	function loadChats() {
		try {
			const raw = localStorage.getItem(CHATS_KEY);
			const list = raw ? JSON.parse(raw) : [];
			if (Array.isArray(list) && list.length) return list;
		} catch {}
		return [];
	}

	function persist() {
		try {
			// Base64 images are megabytes each - keep them in memory only.
			const slim = chats.slice(0, 60).map((c) => ({
				...c,
				messages: c.messages.map((m) =>
					Array.isArray(m.content)
						? {
								role: m.role,
								prompt: m.prompt,
								content: flattenContent(m.content),
							}
						: m
				),
			}));
			localStorage.setItem(CHATS_KEY, JSON.stringify(slim));
		} catch {
			// Quota blown - drop the oldest half and try once more.
			try {
				chats = chats.slice(0, Math.max(1, Math.floor(chats.length / 2)));
				localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
			} catch {}
		}
	}

	function chat() {
		return chats.find((c) => c.id === activeId) || null;
	}

	function ensureChat() {
		if (chat()) return chat();
		const fresh = { id: uid(), title: "New chat", messages: [], at: Date.now() };
		chats.unshift(fresh);
		activeId = fresh.id;
		persist();
		return fresh;
	}

	const el = document.createElement("div");
	el.className = "media-page ai-page";
	el.innerHTML = `
		<aside class="ai-side" data-side>
			<div class="ai-side__brand">${riseLogo()}<span>AI</span></div>
			<button type="button" class="ai-new" data-new>${icon("plus")}<span>New chat</span></button>
			<div class="ai-side__search">
				${icon("search")}
				<input type="search" placeholder="Search chats" data-filter aria-label="Search chats" />
			</div>
			<div class="ai-side__list" data-chats></div>
		</aside>

		<div class="ai-main">
			<header class="ai-top">
				<button type="button" class="ai-icon-btn ai-side-toggle" data-side-toggle aria-label="Toggle sidebar">${icon("panelLeft")}</button>
				<div class="ai-top__model" data-model-slot></div>
				<button type="button" class="ai-share" data-share>${icon("monitor")}<span>Screen Share</span></button>
			</header>

			<div class="ai-thread" data-thread></div>

			<form class="ai-composer" data-form>
				<div class="ai-attach" data-attach hidden></div>
				<div class="ai-composer__field">
					<button type="button" class="ai-plus" data-plus aria-label="Add">${icon("plus")}</button>
					<textarea data-input rows="1" placeholder="Message AI…" aria-label="Message"></textarea>
					<button type="submit" class="ai-send" data-send aria-label="Send">${icon("send")}</button>
				</div>
				<p class="ai-hint" data-hint>Enter to send · Shift + Enter for a new line</p>
			</form>
		</div>

		<input type="file" accept="image/*" multiple hidden data-file />`;
	root.appendChild(el);

	const sideEl = el.querySelector("[data-side]");
	const chatsEl = el.querySelector("[data-chats]");
	const threadEl = el.querySelector("[data-thread]");
	const formEl = el.querySelector("[data-form]");
	const inputEl = el.querySelector("[data-input]");
	const sendEl = el.querySelector("[data-send]");
	const plusEl = el.querySelector("[data-plus]");
	const attachEl = el.querySelector("[data-attach]");
	const hintEl = el.querySelector("[data-hint]");
	const fileEl = el.querySelector("[data-file]");
	const shareEl = el.querySelector("[data-share]");

	/* ── Model picker ───────────────────────────────────────────── */

	let modelDd = null;

	function mountModel() {
		modelDd = dropdown({
			items: models.map((m) => ({
				id: m.id,
				label: m.label,
				blurb: m.blurb,
				icon: "sparkles",
			})),
			value: model,
			searchable: true,
			groupLabel: "Balanced",
			className: "dd--model",
			onPick: (id) => {
				model = id;
				localStorage.setItem(MODEL_KEY, id);
			},
		});
		el.querySelector("[data-model-slot]").replaceChildren(modelDd.el);
	}

	/* ── Plus menu ──────────────────────────────────────────────── */

	const menu = actionMenu({
		sections: [
			{
				label: "Sources",
				items: [
					{ id: "image", icon: "image", label: "Add images", blurb: "Ask about a picture" },
					{ id: "web", icon: "globe", label: "Web search", blurb: "Ground answers in results", toggle: true },
				],
			},
			{
				label: "Tools",
				items: [
					{
						id: "study",
						icon: "graduation",
						label: "Study mode",
						blurb: "Quizzes, flashcards & more",
						toggle: true,
					},
				],
			},
		],
		onPick: (id) => {
			if (id === "image") {
				fileEl.click();
				menu.close();
				return;
			}
			if (id === "web") {
				webSearch = !webSearch;
				menu.setToggle("web", webSearch);
			}
			if (id === "study") {
				studyMode = !studyMode;
				menu.setToggle("study", studyMode);
			}
			paintHint();
		},
	});
	el.querySelector(".ai-composer__field").appendChild(menu.el);

	plusEl.addEventListener("click", (e) => {
		e.stopPropagation();
		if (menu.isOpen) menu.close();
		else menu.open();
	});
	document.addEventListener("pointerdown", (e) => {
		if (menu.isOpen && !menu.el.contains(e.target) && e.target !== plusEl) menu.close();
	});

	function paintHint() {
		const bits = [];
		if (webSearch) bits.push("Web search on");
		if (studyMode) bits.push("Study mode on");
		hintEl.textContent = bits.length
			? bits.join(" · ")
			: "Enter to send · Shift + Enter for a new line";
		plusEl.classList.toggle("is-on", webSearch || studyMode);
	}

	/* ── Gallery lightbox ───────────────────────────────────────── */

	function openGallery(items, start = 0) {
		const list = (items || []).filter(Boolean);
		if (!list.length) return;
		let index = Math.max(0, Math.min(start, list.length - 1));

		const root = document.createElement("div");
		root.className = "ai-lb";
		root.innerHTML = `
			<div class="ai-lb__backdrop" data-close></div>
			<button type="button" class="ai-lb__x" data-close aria-label="Close">${icon("x")}</button>
			${
				list.length > 1
					? `<button type="button" class="ai-lb__nav ai-lb__nav--prev" data-prev aria-label="Previous">${icon("chevronLeft")}</button>
						<button type="button" class="ai-lb__nav ai-lb__nav--next" data-next aria-label="Next">${icon("chevronRight")}</button>`
					: ""
			}
			<figure class="ai-lb__stage">
				<img class="ai-lb__img" alt="" />
				<figcaption class="ai-lb__cap" data-cap></figcaption>
			</figure>`;
		document.body.appendChild(root);
		document.body.classList.add("has-modal");
		requestAnimationFrame(() => root.classList.add("is-open"));

		const imgEl = root.querySelector(".ai-lb__img");
		const capEl = root.querySelector("[data-cap]");

		function paint() {
			const item = list[index];
			imgEl.src = typeof item === "string" ? item : item.src;
			const name = typeof item === "string" ? "" : item.name || "";
			capEl.textContent =
				list.length > 1
					? `${index + 1} / ${list.length}${name ? ` · ${name}` : ""}`
					: name;
			root.querySelector("[data-prev]")?.classList.toggle("is-dim", index === 0);
			root.querySelector("[data-next]")?.classList.toggle(
				"is-dim",
				index === list.length - 1
			);
		}

		function step(dir) {
			index = (index + dir + list.length) % list.length;
			imgEl.classList.remove("is-swap");
			void imgEl.offsetWidth;
			imgEl.classList.add("is-swap");
			paint();
		}

		function close() {
			root.classList.remove("is-open");
			root.classList.add("is-closing");
			document.removeEventListener("keydown", onKey);
			if (!document.querySelector(".modal-root")) {
				document.body.classList.remove("has-modal");
			}
			setTimeout(() => root.remove(), 240);
		}

		function onKey(e) {
			if (e.key === "Escape") {
				e.preventDefault();
				close();
			} else if (e.key === "ArrowLeft") {
				e.preventDefault();
				step(-1);
			} else if (e.key === "ArrowRight") {
				e.preventDefault();
				step(1);
			}
		}

		root.querySelectorAll("[data-close]").forEach((n) => n.addEventListener("click", close));
		root.querySelector("[data-prev]")?.addEventListener("click", () => step(-1));
		root.querySelector("[data-next]")?.addEventListener("click", () => step(1));
		document.addEventListener("keydown", onKey);
		paint();
	}

	/* ── Attachments ────────────────────────────────────────────── */

	function addAttachment(item) {
		attachments.push({
			id: uid(),
			kind: item.kind,
			data: item.data,
			name: item.name || (item.kind === "image" ? "Image" : "Text"),
		});
		renderAttachments();
	}

	function clearAttachments() {
		attachments = [];
		renderAttachments();
	}

	function removeAttachment(id) {
		attachments = attachments.filter((a) => a.id !== id);
		renderAttachments();
	}

	function renderAttachments() {
		if (!attachments.length) {
			attachEl.hidden = true;
			attachEl.innerHTML = "";
			return;
		}

		const images = attachments.filter((a) => a.kind === "image");
		const notes = attachments.filter((a) => a.kind === "text");
		const n = images.length;

		attachEl.hidden = false;
		attachEl.innerHTML = `
			${
				n
					? `<div class="ai-attach__stack" style="--n:${n}" data-stack>
						${images
							.map(
								(item, i) => `
							<button type="button" class="ai-attach__card" data-att="${item.id}" data-img-i="${i}" style="--i:${i}" aria-label="${esc(item.name)}">
								<img src="${item.data}" alt="" />
								<span class="ai-attach__card-x" data-drop aria-label="Remove">${icon("x")}</span>
							</button>`
							)
							.join("")}
					</div>`
					: ""
			}
			${
				notes.length
					? `<div class="ai-attach__notes">
						${notes
							.map(
								(item) => `
							<button type="button" class="ai-attach__chip" data-att="${item.id}">
								<span class="ai-attach__doc">${icon("fileText")}</span>
								<span class="ai-attach__name">${esc(item.name)}</span>
								<span class="ai-attach__x" data-drop aria-label="Remove">${icon("x")}</span>
							</button>`
							)
							.join("")}
					</div>`
					: ""
			}`;

		attachEl.querySelectorAll("[data-att]").forEach((chip) => {
			const item = attachments.find((a) => a.id === chip.dataset.att);
			if (!item) return;
			chip.querySelector("[data-drop]")?.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				removeAttachment(item.id);
			});
			chip.addEventListener("click", (e) => {
				if (e.target.closest("[data-drop]")) return;
				if (item.kind === "image") {
					const imgs = attachments
						.filter((a) => a.kind === "image")
						.map((a) => ({ src: a.data, name: a.name }));
					openGallery(imgs, Number(chip.dataset.imgI) || 0);
				} else {
					openModal({
						title: "Attached text",
						size: "lg",
						body: `<pre class="ai-code" style="max-height:60vh">${esc(item.data)}</pre>`,
					});
				}
			});
		});
	}

	fileEl.addEventListener("change", async () => {
		const files = [...(fileEl.files || [])];
		fileEl.value = "";
		for (const file of files) {
			await new Promise((resolve) => {
				const reader = new FileReader();
				reader.onload = () => {
					addAttachment({
						kind: "image",
						data: reader.result,
						name: file.name || "Image",
					});
					resolve();
				};
				reader.onerror = () => resolve();
				reader.readAsDataURL(file);
			});
		}
	});

	/* ── Sidebar ────────────────────────────────────────────────── */

	function renderChats() {
		const q = filter.trim().toLowerCase();
		const list = chats.filter(
			(c) =>
				!q ||
				c.title.toLowerCase().includes(q) ||
				c.messages.some((m) => msgText(m).toLowerCase().includes(q))
		);

		if (!list.length) {
			chatsEl.innerHTML = `<p class="ai-side__empty">${chats.length ? "No matches" : "No chats yet"}</p>`;
			return;
		}

		const today = new Date().toDateString();
		const groups = { Today: [], Earlier: [] };
		list.forEach((c) => {
			(new Date(c.at).toDateString() === today ? groups.Today : groups.Earlier).push(c);
		});

		chatsEl.innerHTML = Object.entries(groups)
			.filter(([, items]) => items.length)
			.map(
				([label, items]) => `
			<p class="ai-side__label">${label}</p>
			${items
				.map(
					(c) => `
				<button type="button" class="ai-chat-row${c.id === activeId ? " is-on" : ""}" data-chat="${c.id}">
					<span>${esc(c.title)}</span>
				</button>`
				)
				.join("")}`
			)
			.join("");

		chatsEl.querySelectorAll("[data-chat]").forEach((btn) => {
			btn.addEventListener("click", () => {
				activeId = btn.dataset.chat;
				renderChats();
				renderThread();
			});
			btn.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				const target = chats.find((c) => c.id === btn.dataset.chat);
				contextMenu(e.clientX, e.clientY, [
					{
						label: "Rename",
						icon: "pencil",
						run: async () => {
							const name = await promptModal({
								title: "Rename chat",
								label: "Title",
								value: target.title,
								confirmText: "Rename",
							});
							if (!name) return;
							target.title = name;
							persist();
							renderChats();
						},
					},
					{
						label: "Delete",
						icon: "trash",
						danger: true,
						run: async () => {
							const ok = await confirmModal({
								title: `Delete "${target.title}"?`,
								subtitle: "This conversation is removed from this device.",
								confirmText: "Delete",
								danger: true,
							});
							if (!ok) return;
							chats = chats.filter((c) => c.id !== target.id);
							if (activeId === target.id) activeId = chats[0]?.id || null;
							persist();
							renderChats();
							renderThread();
						},
					},
				]);
			});
		});
	}

	/* ── Thread ─────────────────────────────────────────────────── */

	function emptyState() {
		return `
			<div class="ai-empty">
				<span class="ai-empty__logo">${riseLogo()}</span>
				<h2>What can I help with?</h2>
				<p>Ask anything, drop in an image, or share your screen.</p>
				<div class="ai-starters">
					${STARTERS.map(
						(s) => `<button type="button" class="ai-starter" data-starter="${esc(s.prompt)}">${esc(s.label)}</button>`
					).join("")}
				</div>
			</div>`;
	}

	function bubble(msg, index) {
		if (msg.role === "user") {
			const prompt = userPromptOf(msg);
			const images = userImagesOf(msg);
			const textAtts = userTextAttsOf(msg);
			const n = images.length;
			const imgStack = n
				? `<div class="ai-bubble__atts" style="--n:${n}">
					${images
						.map(
							(src, ii) =>
								`<button type="button" class="ai-bubble__card" data-img-msg="${index}" data-img-i="${ii}" style="--i:${ii}" aria-label="View image">
									<img src="${src}" alt="" />
								</button>`
						)
						.join("")}
				</div>`
				: "";
			const noteChips = textAtts.length
				? `<div class="ai-bubble__notes">
					${textAtts
						.map(
							(t, ti) =>
								`<button type="button" class="ai-bubble__chip" data-text-msg="${index}" data-text-i="${ti}">${icon("fileText")}<span>${esc(t.name)}</span></button>`
						)
						.join("")}
				</div>`
				: "";
			return `<article class="ai-msg ai-msg--me">
				<div class="ai-msg__bundle">
					${imgStack}
					${noteChips}
					<div class="ai-bubble"><span class="ai-bubble__text">${esc(prompt)}</span></div>
				</div>
			</article>`;
		}

		const raw = Array.isArray(msg.content)
			? msg.content.find((p) => p.type === "text")?.text || ""
			: msg.content || "";
		const parts = splitThinking(raw);
		const answer = parts.answer;
		const thinking = parts.thinking;
		const showThink = parts.hasThink || (!answer && !raw);
		const actions = answer
			? `<div class="ai-msg__actions">
					<button type="button" class="ai-msg__btn" data-act="copy" data-i="${index}" title="Copy" aria-label="Copy">${icon("copy")}</button>
					<button type="button" class="ai-msg__btn${speakingIndex === index ? " is-on" : ""}" data-act="speak" data-i="${index}" title="Read aloud" aria-label="Read aloud">${icon("volume")}</button>
					<button type="button" class="ai-msg__btn" data-act="reload" data-i="${index}" title="Regenerate" aria-label="Regenerate">${icon("rotate")}</button>
				</div>`
			: "";

		const thinkBlock = showThink
			? `<div class="ai-think${parts.thinkingDone && thinking ? " is-done" : " is-live"}${thinking ? "" : " is-empty"}" data-think="${index}">
					<button type="button" class="ai-think__tab" data-think-toggle="${index}">
						<span class="ai-think__orb" aria-hidden="true"></span>
						<span class="ai-think__label">${
							parts.thinkingDone
								? thinking
									? "Thought"
									: "Thinking"
								: "Thinking"
						}</span>
						${thinking ? `<span class="ai-think__chev" aria-hidden="true"></span>` : ""}
					</button>
					${
						thinking
							? `<div class="ai-think__panel" hidden><pre>${esc(thinking)}</pre></div>`
							: ""
					}
				</div>`
			: "";

		return `
			<article class="ai-msg ai-msg--ai" data-ai-msg="${index}">
				<div class="ai-msg__lead">
					<span class="ai-avatar">${icon("bot")}</span>
					${thinkBlock}
				</div>
				<div class="ai-msg__body">
					<div class="ai-bubble ai-bubble--ai${answer ? " is-in" : ""}" data-body="${index}">
						${
							answer
								? md(answer)
								: parts.hasThink && !parts.thinkingDone
									? ``
									: `<span class="ai-typing"><i></i><i></i><i></i></span>`
						}
					</div>
					${actions}
				</div>
			</article>`;
	}

	function stopSpeaking() {
		speakGen += 1;
		try {
			window.speechSynthesis?.cancel();
		} catch {}
		speakingIndex = null;
		threadEl?.querySelectorAll(".ai-msg__btn[data-act='speak'].is-on").forEach((btn) => {
			btn.classList.remove("is-on");
		});
	}

	function syncSpeakButton(index) {
		threadEl?.querySelectorAll(".ai-msg__btn[data-act='speak']").forEach((btn) => {
			btn.classList.toggle("is-on", Number(btn.dataset.i) === index);
		});
	}

	function paintStream(index, raw, done = false) {
		const article = threadEl.querySelector(`[data-ai-msg="${index}"]`);
		const body = threadEl.querySelector(`[data-body="${index}"]`);
		if (!article || !body) return;

		const parts = splitThinking(raw);
		let think = article.querySelector(`[data-think="${index}"]`);
		const lead = article.querySelector(".ai-msg__lead");

		if (parts.hasThink) {
			if (!think && lead) {
				lead.insertAdjacentHTML(
					"beforeend",
					`<div class="ai-think is-live" data-think="${index}">
						<button type="button" class="ai-think__tab" data-think-toggle="${index}">
							<span class="ai-think__orb" aria-hidden="true"></span>
							<span class="ai-think__label">Thinking</span>
							<span class="ai-think__chev" aria-hidden="true"></span>
						</button>
						<div class="ai-think__panel" hidden><pre></pre></div>
					</div>`
				);
				think = lead.querySelector(`[data-think="${index}"]`);
				think?.querySelector("[data-think-toggle]")?.addEventListener("click", () => {
					const panel = think.querySelector(".ai-think__panel");
					if (panel) panel.hidden = !panel.hidden;
					think.classList.toggle("is-open", !panel?.hidden);
				});
			}
			if (think) {
				think.classList.toggle("is-live", !parts.thinkingDone);
				think.classList.toggle("is-done", parts.thinkingDone);
				think.classList.toggle("is-empty", !parts.thinking);
				const label = think.querySelector(".ai-think__label");
				if (label) label.textContent = parts.thinkingDone ? "Thought" : "Thinking";
				const pre = think.querySelector(".ai-think__panel pre");
				if (pre) pre.textContent = parts.thinking;
			}
		}

		if (parts.answer) {
			body.classList.add("is-in");
			// Mid-stream: skip the math pass so partial LaTeX doesn't flash as
			// broken markup, and mark the node so it can't reflow its siblings.
			body.classList.toggle("is-streaming", !done);
			body.innerHTML = md(parts.answer, { math: done });
		} else if (parts.hasThink && !parts.thinkingDone) {
			body.innerHTML = "";
		} else if (!raw) {
			body.innerHTML = `<span class="ai-typing"><i></i><i></i><i></i></span>`;
		}
	}

	/**
	 * Tokens land far faster than the eye needs. Repaint on a fixed cadence so
	 * the bubble stops strobing, and always paint the final state.
	 */
	let paintTimer = null;
	let paintQueued = null;

	function queueStream(index, raw, done = false) {
		paintQueued = { index, raw };

		if (done) {
			clearTimeout(paintTimer);
			paintTimer = null;
			paintStream(index, raw, true);
			paintQueued = null;
			return;
		}

		if (paintTimer) return;
		paintTimer = setTimeout(() => {
			paintTimer = null;
			if (paintQueued) paintStream(paintQueued.index, paintQueued.raw, false);
		}, STREAM_FRAME);
	}

	function cancelStream() {
		clearTimeout(paintTimer);
		paintTimer = null;
		paintQueued = null;
	}

	function renderThread() {
		const current = chat();
		threadEl.innerHTML = current?.messages.length
			? current.messages.map(bubble).join("")
			: emptyState();

		threadEl.querySelectorAll("[data-copy]").forEach((btn) => {
			btn.addEventListener("click", () => {
				const code = btn.parentElement.querySelector("code")?.innerText || "";
				navigator.clipboard?.writeText(code).then(() => {
					btn.classList.add("is-done");
					btn.querySelector("span").textContent = "Copied";
					setTimeout(() => {
						btn.classList.remove("is-done");
						btn.querySelector("span").textContent = "Copy";
					}, 1600);
				});
			});
		});

		threadEl.querySelectorAll("[data-starter]").forEach((btn) => {
			btn.addEventListener("click", () => {
				inputEl.value = btn.dataset.starter;
				inputEl.focus();
				resize();
			});
		});

		threadEl.querySelectorAll("[data-text-msg]").forEach((btn) => {
			btn.addEventListener("click", () => {
				const msg = chat()?.messages[Number(btn.dataset.textMsg)];
				const att = msg && userTextAttsOf(msg)[Number(btn.dataset.textI)];
				if (!att) return;
				openModal({
					title: att.name,
					size: "lg",
					body: `<pre class="ai-code" style="max-height:60vh">${esc(att.data)}</pre>`,
				});
			});
		});

		threadEl.querySelectorAll("[data-img-msg]").forEach((btn) => {
			btn.addEventListener("click", () => {
				const msg = chat()?.messages[Number(btn.dataset.imgMsg)];
				const imgs = msg ? userImagesOf(msg) : [];
				if (!imgs.length) return;
				openGallery(imgs, Number(btn.dataset.imgI) || 0);
			});
		});

		threadEl.querySelectorAll("[data-think-toggle]").forEach((btn) => {
			btn.addEventListener("click", () => {
				const think = btn.closest(".ai-think");
				const panel = think?.querySelector(".ai-think__panel");
				if (!think || !panel) return;
				panel.hidden = !panel.hidden;
				think.classList.toggle("is-open", !panel.hidden);
			});
		});

		threadEl.querySelectorAll("[data-act]").forEach((btn) => {
			btn.addEventListener("click", () => {
				const index = Number(btn.dataset.i);
				const msg = chat()?.messages[index];
				if (!msg || msg.role !== "assistant") return;
				const act = btn.dataset.act;

				if (act === "copy") {
					const text = splitThinking(msgText(msg)).answer || msgText(msg);
					navigator.clipboard?.writeText(text).then(() => {
						notify("Copied", "Reply copied to clipboard", "success");
					});
					return;
				}

				if (act === "speak") {
					if (!window.speechSynthesis) {
						notify("Speech unavailable", "This browser has no text-to-speech", "error");
						return;
					}
					if (speakingIndex === index) {
						stopSpeaking();
						return;
					}
					stopSpeaking();
					const gen = speakGen;
					speakingIndex = index;
					syncSpeakButton(index);
					const voice = getPreferredVoice();
					speakText(
						msgText(msg),
						voice,
						0.9,
						1,
						() => {
							if (speakGen === gen && speakingIndex === index) {
								speakingIndex = null;
								syncSpeakButton(-1);
							}
						},
						() => speakGen === gen && speakingIndex === index
					);
					return;
				}

				if (act === "reload") {
					regenerate(index);
				}
			});
		});

		threadEl.scrollTop = threadEl.scrollHeight;
	}

	function resize() {
		inputEl.style.height = "auto";
		inputEl.style.height = `${Math.min(inputEl.scrollHeight, 190)}px`;
	}

	/* ── Sending ────────────────────────────────────────────────── */

	function buildUserMessage(text) {
		const question = text.trim();
		const images = attachments.filter((a) => a.kind === "image");
		const notes = attachments.filter((a) => a.kind === "text");
		const prompt =
			question ||
			(images.length ? "What's in this image?" : notes.length ? "Here's some text:" : "");

		if (!images.length && !notes.length) {
			return { role: "user", prompt, content: prompt };
		}

		const parts = [];
		for (const note of notes) {
			parts.push({ type: "text", text: `Attached document:\n${note.data}` });
		}
		parts.push({ type: "text", text: prompt });
		for (const img of images) {
			parts.push({ type: "image_url", image_url: { url: img.data } });
		}
		return { role: "user", prompt, content: parts };
	}

	function toModelMessage(m, keepImages) {
		const role = m.role === "assistant" ? "assistant" : "user";
		if (!Array.isArray(m.content)) {
			const text =
				role === "assistant"
					? splitThinking(String(m.content || "")).answer || String(m.content || "")
					: String(m.content || "");
			return { role, content: text.slice(0, role === "assistant" ? 8000 : 12000) };
		}
		if (!keepImages) {
			return { role, content: flattenContent(m.content).slice(0, 8000) };
		}
		const parts = [];
		for (const part of m.content) {
			if (part?.type === "text" && typeof part.text === "string") {
				parts.push({ type: "text", text: part.text.slice(0, 12000) });
			} else if (part?.type === "image_url" && part.image_url?.url) {
				parts.push({ type: "image_url", image_url: { url: part.image_url.url } });
			}
		}
		return { role, content: parts.length ? parts : flattenContent(m.content) };
	}

	async function streamReply(current, question) {
		streaming = true;
		sendEl.classList.add("is-busy");
		abort = new AbortController();

		const msgIndex = current.messages.length - 1;
		let answer = "";
		let thinkBuf = "";
		let answerBuf = "";

		function combined() {
			if (thinkBuf) return `<think>${thinkBuf}</think>\n${answerBuf}`;
			return answerBuf;
		}

		try {
			// Cap history and drop old images so follow-ups don't trip TPM limits.
			const history = current.messages.slice(0, -1).slice(-SEND_TURNS);
			const outgoing = history.map((m, i) =>
				toModelMessage(m, i === history.length - 1 && m.role === "user")
			);

			if (studyMode) outgoing.unshift({ role: "user", content: STUDY_PROMPT });

			if (webSearch && question) {
				const found = await fetch(`/api/search/web?q=${encodeURIComponent(question)}`)
					.then((r) => r.json())
					.catch(() => ({ results: [] }));
				if (found.results?.length) {
					outgoing.unshift({
						role: "user",
						content:
							"Use these web results where relevant and cite the sources by name:\n" +
							found.results
								.map((r, i) => `${i + 1}. ${r.title} - ${r.snippet} (${r.url})`)
								.join("\n"),
					});
				}
			}

			/** Prefer Scramjet → provider; fall back to the Express relay. */
			async function openStream() {
				const payload = { model, messages: outgoing };
				try {
					await ensureScramjet?.();
					const bridgeRes = await fetch("/api/ai/bridge", {
						method: "POST",
						headers: await aiHeaders({ "Content-Type": "application/json" }),
						body: JSON.stringify(payload),
						signal: abort.signal,
					});
					const bridge = await bridgeRes.json().catch(() => ({}));
					if (!bridgeRes.ok) {
						throw new Error(bridge.error || `Bridge failed (${bridgeRes.status})`);
					}
					const proxied = proxify?.(bridge.url) || bridge.url;
					const upstream = await fetch(proxied, {
						method: "POST",
						headers: bridge.headers,
						body: JSON.stringify(bridge.body),
						signal: abort.signal,
					});
					if (upstream.ok) return upstream;
					// Provider rejected through the proxy - try the local relay.
				} catch {
					/* fall through */
				}
				return fetch("/api/ai/chat", {
					method: "POST",
					headers: await aiHeaders({ "Content-Type": "application/json" }),
					body: JSON.stringify(payload),
					signal: abort.signal,
				});
			}

			const res = await openStream();

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				let msg = data.error || `Request failed (${res.status})`;
				try {
					const parsed = JSON.parse(msg);
					msg = parsed?.error?.message || parsed?.message || msg;
				} catch {}
				if (/request too large|tokens per minute|\bTPM\b|reduce your message size/i.test(msg)) {
					msg = "Character limit exceeded";
				}
				throw new Error(msg);
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

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
						answer = combined();
						queueStream(msgIndex, answer);
						threadEl.scrollTop = threadEl.scrollHeight;
					} catch {}
				}
			}

			answer = combined() || answer;
			current.messages[msgIndex].content = answer || "(no answer)";
			if (current.messages.length > MAX_TURNS) {
				current.messages = current.messages.slice(-MAX_TURNS);
			}
			window.dispatchEvent(new CustomEvent("riseub:xp", { detail: "ai" }));
		} catch (err) {
			if (err.name === "AbortError") {
				current.messages[msgIndex].content = answer || combined() || "(stopped)";
			} else {
				current.messages.pop();
				notify("AI request failed", err.message, "error");
			}
		} finally {
			streaming = false;
			abort = null;
			sendEl.classList.remove("is-busy");
			// Drop any queued mid-stream paint; the full render below supersedes
			// it and includes the math pass.
			cancelStream();
			persist();
			renderChats();
			renderThread();
		}
	}

	async function send(text) {
		if (streaming || (!text.trim() && !attachments.length)) return;
		if (!configured) {
			notify("AI isn't set up", "Add GROQ_API_KEY to your .env", "error");
			return;
		}

		const current = ensureChat();
		const userMsg = buildUserMessage(text);
		const question = userMsg.prompt;

		current.messages.push(userMsg);
		if (current.title === "New chat" && question) {
			current.title = question.slice(0, 40);
		}
		current.at = Date.now();
		current.messages.push({ role: "assistant", content: "" });
		clearAttachments();
		persist();
		renderChats();
		renderThread();

		await streamReply(current, question);
	}

	async function regenerate(assistantIndex) {
		if (streaming) return;
		const current = chat();
		if (!current) return;
		const userMsg = current.messages[assistantIndex - 1];
		if (!userMsg || userMsg.role !== "user") return;

		stopSpeaking();
		current.messages = current.messages.slice(0, assistantIndex);
		current.messages.push({ role: "assistant", content: "" });
		current.at = Date.now();
		persist();
		renderChats();
		renderThread();

		await streamReply(current, userPromptOf(userMsg));
	}

	/* ── Wiring ─────────────────────────────────────────────────── */

	formEl.addEventListener("submit", (e) => {
		e.preventDefault();
		if (streaming) {
			abort?.abort();
			return;
		}
		const text = inputEl.value;
		inputEl.value = "";
		resize();
		send(text);
	});

	inputEl.addEventListener("input", resize);

	// Paste an image straight in, or a wall of text as an attachment.
	inputEl.addEventListener("paste", (e) => {
		const items = [...(e.clipboardData?.items || [])];
		const files = items
			.filter((i) => i.type.startsWith("image/"))
			.map((i) => i.getAsFile())
			.filter(Boolean);

		if (files.length) {
			e.preventDefault();
			files.forEach((file) => {
				const reader = new FileReader();
				reader.onload = () =>
					addAttachment({
						kind: "image",
						data: reader.result,
						name: file.name || "Image",
					});
				reader.readAsDataURL(file);
			});
			return;
		}

		const text = e.clipboardData?.getData("text") || "";
		if (text.length > LONG_PASTE) {
			e.preventDefault();
			addAttachment({
				kind: "text",
				data: text,
				name: `Pasted text · ${text.length.toLocaleString()} chars`,
			});
		}
	});
	inputEl.addEventListener("keydown", (e) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			formEl.requestSubmit();
		}
	});

	el.querySelector("[data-new]").addEventListener("click", () => {
		const fresh = { id: uid(), title: "New chat", messages: [], at: Date.now() };
		chats.unshift(fresh);
		activeId = fresh.id;
		persist();
		renderChats();
		renderThread();
		inputEl.focus();
	});

	el.querySelector("[data-filter]").addEventListener("input", (e) => {
		filter = e.target.value;
		renderChats();
	});

	el.querySelector("[data-side-toggle]").addEventListener("click", () => {
		sideEl.classList.toggle("is-hidden");
	});

	shareEl.addEventListener("click", () => {
		if (isSharing()) stopScreenShare();
		else startScreenShare();
	});

	window.addEventListener("riseub:screenshare", (e) => {
		shareEl.classList.toggle("is-live", !!e.detail);
		shareEl.querySelector("span").textContent = e.detail ? "Stop sharing" : "Screen Share";
	});

	aiHeaders()
		.then((headers) => fetch("/api/ai/models", { headers }))
		.then((r) => r.json())
		.then((data) => {
			models = data.models || [];
			configured = !!data.configured;
			model = models.some((m) => m.id === model) ? model : models[0]?.id || "";
			mountModel();
			el.classList.toggle("is-offline", !configured);
			if (!configured) {
				notify("AI needs a key", "Add GROQ_API_KEY to your .env", "error");
			}
		})
		.catch(() => {
			configured = false;
		});

	renderChats();
	renderThread();
	paintHint();
	resize();

	return {
		destroy() {
			abort?.abort();
			stopSpeaking();
			el.remove();
		},
	};
}
