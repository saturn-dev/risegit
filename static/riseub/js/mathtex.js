/**
 * A small LaTeX subset renderer - enough for algebra homework without pulling
 * in KaTeX. Handles fractions, roots, powers, indices, and the usual symbols.
 * Input is already HTML-escaped by the caller.
 */

const SYMBOLS = {
	pm: "±",
	mp: "∓",
	times: "×",
	div: "÷",
	cdot: "·",
	le: "≤",
	leq: "≤",
	ge: "≥",
	geq: "≥",
	ne: "≠",
	neq: "≠",
	approx: "≈",
	equiv: "≡",
	to: "→",
	rightarrow: "→",
	leftarrow: "←",
	Rightarrow: "⇒",
	infty: "∞",
	sum: "∑",
	prod: "∏",
	int: "∫",
	partial: "∂",
	nabla: "∇",
	in: "∈",
	notin: "∉",
	subset: "⊂",
	subseteq: "⊆",
	cup: "∪",
	cap: "∩",
	emptyset: "∅",
	forall: "∀",
	exists: "∃",
	therefore: "∴",
	angle: "∠",
	degree: "°",
	circ: "∘",
	ldots: "…",
	cdots: "⋯",
	alpha: "α",
	beta: "β",
	gamma: "γ",
	delta: "δ",
	Delta: "Δ",
	epsilon: "ε",
	varepsilon: "ε",
	zeta: "ζ",
	eta: "η",
	theta: "θ",
	Theta: "Θ",
	lambda: "λ",
	Lambda: "Λ",
	mu: "μ",
	pi: "π",
	Pi: "Π",
	rho: "ρ",
	sigma: "σ",
	Sigma: "Σ",
	tau: "τ",
	phi: "φ",
	Phi: "Φ",
	chi: "χ",
	psi: "ψ",
	omega: "ω",
	Omega: "Ω",
};

const FUNCTIONS = [
	"sin",
	"cos",
	"tan",
	"csc",
	"sec",
	"cot",
	"log",
	"ln",
	"exp",
	"lim",
	"max",
	"min",
	"det",
	"arcsin",
	"arccos",
	"arctan",
];

/** Pull the {...} group starting at `i`, respecting nesting. */
function group(src, i) {
	if (src[i] !== "{") {
		// A bare token: \sqrt x or ^2
		return { body: src[i] ?? "", next: i + 1 };
	}
	let depth = 0;
	for (let j = i; j < src.length; j++) {
		if (src[j] === "{") depth++;
		else if (src[j] === "}") {
			depth--;
			if (depth === 0) return { body: src.slice(i + 1, j), next: j + 1 };
		}
	}
	return { body: src.slice(i + 1), next: src.length };
}

function render(src) {
	let out = "";
	let i = 0;

	while (i < src.length) {
		const ch = src[i];

		if (ch === "\\") {
			const name = src.slice(i + 1).match(/^[a-zA-Z]+/)?.[0];

			if (name === "frac" || name === "dfrac" || name === "tfrac") {
				const top = group(src, i + 1 + name.length);
				const bottom = group(src, top.next);
				out += `<span class="mfrac"><span class="mfrac__n">${render(top.body)}</span><span class="mfrac__d">${render(bottom.body)}</span></span>`;
				i = bottom.next;
				continue;
			}

			if (name === "sqrt") {
				let rest = i + 1 + name.length;
				let index = "";
				if (src[rest] === "[") {
					const close = src.indexOf("]", rest);
					index = src.slice(rest + 1, close);
					rest = close + 1;
				}
				const body = group(src, rest);
				out += `<span class="msqrt">${
					index ? `<span class="msqrt__i">${render(index)}</span>` : ""
				}<span class="msqrt__r">√</span><span class="msqrt__b">${render(body.body)}</span></span>`;
				i = body.next;
				continue;
			}

			if (name === "text" || name === "mathrm" || name === "operatorname") {
				const body = group(src, i + 1 + name.length);
				out += `<span class="mtext">${body.body}</span>`;
				i = body.next;
				continue;
			}

			if (name === "left" || name === "right" || name === "displaystyle") {
				i += 1 + name.length;
				continue;
			}

			if (name && FUNCTIONS.includes(name)) {
				out += `<span class="mfn">${name}</span>`;
				i += 1 + name.length;
				continue;
			}

			if (name && SYMBOLS[name]) {
				out += `<span class="mop">${SYMBOLS[name]}</span>`;
				i += 1 + name.length;
				continue;
			}

			if (name) {
				out += name;
				i += 1 + name.length;
				continue;
			}

			// Escaped punctuation such as \{ or \\
			out += src[i + 1] === "\\" ? "<br />" : (src[i + 1] ?? "");
			i += 2;
			continue;
		}

		if (ch === "^" || ch === "_") {
			const body = group(src, i + 1);
			out += `<${ch === "^" ? "sup" : "sub"}>${render(body.body)}</${ch === "^" ? "sup" : "sub"}>`;
			i = body.next;
			continue;
		}

		if (ch === "{" || ch === "}") {
			i += 1;
			continue;
		}

		// Single letters read as variables and get the slanted treatment.
		if (/[a-zA-Z]/.test(ch)) {
			const word = src.slice(i).match(/^[a-zA-Z]+/)[0];
			out +=
				word.length === 1
					? `<i class="mvar">${word}</i>`
					: `<span class="mword">${word}</span>`;
			i += word.length;
			continue;
		}

		if (/[+\-=<>]/.test(ch)) {
			out += `<span class="mop">${ch === "-" ? "−" : ch}</span>`;
			i += 1;
			continue;
		}

		out += ch;
		i += 1;
	}

	return out;
}

/** Drop any HTML that snuck into a math body so tags never render as text. */
function stripTags(s) {
	return String(s || "")
		.replace(/<[^>]+>/g, " ")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Swap every \( \) and \[ \] region in an escaped HTML string for rendered
 * math. Everything outside the delimiters is left exactly as it was.
 */
export function renderMath(html) {
	if (!html || !/\\\(|\\\[|\\frac|\\sqrt|\$\$|\$/.test(html)) return html;

	let out = html;

	// Display math first so its delimiters aren't eaten by the inline pass.
	out = out.replace(/\\\[([\s\S]*?)\\\]/g, (_m, body) => {
		return `<span class="math math--block">${render(stripTags(body))}</span>`;
	});

	out = out.replace(/\\\(([\s\S]*?)\\\)/g, (_m, body) => {
		return `<span class="math">${render(stripTags(body))}</span>`;
	});

	// $$ ... $$ and $ ... $, which some models use regardless of instructions.
	out = out.replace(/\$\$([\s\S]*?)\$\$/g, (_m, body) => {
		return `<span class="math math--block">${render(stripTags(body))}</span>`;
	});

	out = out.replace(/(^|[^\w$])\$([^$\n]+?)\$(?![\w$])/g, (_m, before, body) => {
		return `${before}<span class="math">${render(stripTags(body))}</span>`;
	});

	return out;
}
