import { icon } from "./icons.js";
import { renderMath } from "./mathtex.js";

function esc(s) {
	const d = document.createElement("div");
	d.textContent = s == null ? "" : s;
	return d.innerHTML;
}

const KEYWORDS =
	/\b(const|let|var|function|return|if|else|for|while|class|new|import|export|from|await|async|try|catch|throw|typeof|instanceof|def|elif|lambda|print|public|private|static|void|int|string|bool|true|false|null|undefined|None|True|False|self|this)\b/g;

function highlight(code, lang) {
	const safe = code;
	if (["", "text", "txt", "md"].includes(lang)) return safe;

	return safe
		.replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|`[^`]*?`)/g, '<span class="tk-str">$1</span>')
		.replace(/(^|\n)(\s*(?:\/\/|#).*)/g, '$1<span class="tk-com">$2</span>')
		.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="tk-com">$1</span>')
		.replace(KEYWORDS, '<span class="tk-key">$&</span>')
		.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tk-num">$1</span>')
		.replace(/([a-zA-Z_$][\w$]*)(\s*\()/g, '<span class="tk-fn">$1</span>$2');
}

function inline(s, proxify) {
	const href = (url) => {
		try {
			return proxify?.(url) || url;
		} catch {
			return url;
		}
	};
	return s
		.replace(/`([^`]+)`/g, "<code>$1</code>")
		.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>")
		.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
		.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
		.replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>")
		.replace(/~~([^~]+)~~/g, "<s>$1</s>")
		.replace(/!\[([^\]]*)\]\((https?:[^)\s]+)\)/g, (_, alt, url) => {
			return `<img class="ai-md-img" src="${href(url)}" alt="${alt}" loading="lazy" />`;
		})
		.replace(
			/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
			(_, label, url) =>
				`<a href="${href(url)}" target="_blank" rel="noreferrer">${label}</a>`
		);
}

/**
 * Pull display / inline math out before line wrapping so `\[ … \]` never gets
 * split across `<p>` tags (which makes renderMath treat the tags as text).
 */
function extractMath(chunk) {
	const slots = [];
	const put = (kind, body) => {
		const i = slots.length;
		slots.push({ kind, body: body.trim() });
		// Block math gets its own lines so it isn't wrapped in <p>.
		return kind === "block" ? `\n\n@@MATH${i}@@\n\n` : `@@MATH${i}@@`;
	};

	let out = chunk
		.replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => put("block", m))
		.replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => put("block", m))
		.replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => put("inline", m))
		.replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (_, before, m) => before + put("inline", m));

	return { text: out, slots };
}

function restoreMath(html, slots, { math }) {
	return html.replace(/@@MATH(\d+)@@/g, (_, n) => {
		const slot = slots[Number(n)];
		if (!slot) return "";
		const body = slot.body;
		if (!math) {
			return slot.kind === "block"
				? `<div class="ai-math ai-math--block">${body}</div>`
				: `<span class="ai-math">${body}</span>`;
		}
		const rendered = renderMath(
			slot.kind === "block" ? `\\[${body}\\]` : `\\(${body}\\)`
		);
		return rendered;
	});
}

/** Markdown + light math ($ / $$ / \\( \\) / \\[ \\]) for AI replies. */
export function renderMarkdown(text, { math = true, proxify } = {}) {
	return esc(text)
		.split(/```/)
		.map((chunk, i) => {
			if (i % 2 === 1) {
				const lang = (chunk.match(/^([a-z0-9+#-]*)\n/i)?.[1] || "").toLowerCase();
				const body = chunk.replace(/^[a-z0-9+#-]*\n/i, "");
				return `<div class="ai-codewrap">
					<span class="ai-codelang">${esc(lang || "text")}</span>
					<button type="button" class="ai-copy" data-copy aria-label="Copy code">${icon("copy")}<span>Copy</span></button>
					<pre class="ai-code" data-lang="${esc(lang)}"><code>${highlight(body, lang)}</code></pre>
				</div>`;
			}

			const { text: prepped, slots } = extractMath(chunk);
			const lines = prepped.split("\n");
			const out = [];
			let list = null;

			const closeList = () => {
				if (list) {
					out.push(`</${list}>`);
					list = null;
				}
			};

			for (const raw of lines) {
				const line = raw.trimEnd();
				const mathSlot = line.match(/^@@MATH(\d+)@@$/);
				if (mathSlot) {
					closeList();
					out.push(`@@MATH${mathSlot[1]}@@`);
					continue;
				}

				const heading = line.match(/^(#{1,6})\s+(.*)$/);
				if (heading) {
					closeList();
					const level = Math.min(4, heading[1].length + 1);
					out.push(
						`<h${level} class="ai-h">${inline(heading[2], proxify)}</h${level}>`
					);
					continue;
				}

				if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
					closeList();
					out.push('<hr class="ai-hr" />');
					continue;
				}

				const quote = line.match(/^>\s?(.*)$/);
				if (quote) {
					closeList();
					out.push(
						`<blockquote class="ai-quote">${inline(quote[1], proxify)}</blockquote>`
					);
					continue;
				}

				const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
				const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
				if (ordered || bullet) {
					const want = ordered ? "ol" : "ul";
					if (list !== want) {
						closeList();
						out.push(`<${want}>`);
						list = want;
					}
					out.push(`<li>${inline((ordered || bullet)[1], proxify)}</li>`);
					continue;
				}

				closeList();
				if (!line.trim()) out.push("");
				else out.push(`<p>${inline(line, proxify)}</p>`);
			}

			closeList();
			return restoreMath(out.filter(Boolean).join(""), slots, { math });
		})
		.join("");
}
