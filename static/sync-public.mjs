#!/usr/bin/env node
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "public");
const OUT = join(__dirname, "riseub");
const TPL = join(__dirname, "riseub-templates");

function patchIndex(html) {
	return html
		.replace(/href="\/css\//g, 'href="./css/')
		.replace(/src="\/js\//g, 'src="./js/')
		.replace(
			'<script src="/bootstrap-init.js"></script>',
			'<script src="./cdn-runtime.js"></script>\n\t\t<script src="./wisp-resolver.js"></script>\n\t\t<script src="./bootstrap-init.js"></script>'
		);
}

function patchAppJs(code) {
	if (code.includes("__RISEUB_EMBED_TARGET")) return code;
	return code.replace(
		"if (proxyTarget) {\n\t\t\t\ttabs.create({ url: proxyTarget });\n\t\t\t\treturn;\n\t\t\t}",
		`const embedTarget = window.__RISEUB_EMBED_TARGET || "";
\t\t\tif (embedTarget) {
\t\t\t\ttabs.create({ url: embedTarget });
\t\t\t\treturn;
\t\t\t}
\t\t\tif (proxyTarget) {
\t\t\t\ttabs.create({ url: proxyTarget });
\t\t\t\treturn;
\t\t\t}`
	);
}

function patchAuthJs(code) {
	if (code.includes("__RISEUB_STATIC")) return code;
	return code.replace(
		"export function requireAccount() {\n\treturn new Promise((resolve) => {",
		`export function requireAccount() {
\treturn new Promise((resolve) => {
\t\tif (window.__RISEUB_STATIC || window.__RISEUB_SKIP_GATE || window.__RISEUB_EMBED_TARGET) {
\t\t\tresolve(false);
\t\t\treturn;
\t\t}`
	);
}

if (!existsSync(SRC)) {
	console.error("public/ folder not found");
	process.exit(1);
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });

mkdirSync(OUT, { recursive: true });
cpSync(SRC, OUT, { recursive: true });

writeFileSync(join(OUT, "index.html"), patchIndex(readFileSync(join(OUT, "index.html"), "utf8")), "utf8");
writeFileSync(join(OUT, "js/app.js"), patchAppJs(readFileSync(join(OUT, "js/app.js"), "utf8")), "utf8");
writeFileSync(join(OUT, "js/auth.js"), patchAuthJs(readFileSync(join(OUT, "js/auth.js"), "utf8")), "utf8");

for (const file of ["cdn-runtime.js", "wisp-resolver.js", "bootstrap-init.js"]) {
	writeFileSync(join(OUT, file), readFileSync(join(TPL, file), "utf8"), "utf8");
}

console.log("Synced public/ → static/riseub/ (fully static, no VPS)");
