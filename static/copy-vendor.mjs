#!/usr/bin/env node
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DL = join(ROOT, "node_modules/@mercuryworkshop/proxy-bootstrap/dist/.downloads");
const OUT = join(__dirname, "riseub/vendor");

const MAP = [
	["scramjet/package/dist/scramjet.js", "scramjet/scramjet.js"],
	["scramjet/package/dist/scramjet.wasm", "scramjet/scramjet.wasm"],
	["controller/package/dist/controller.api.js", "controller/controller.api.js"],
	["controller/package/dist/controller.inject.js", "controller/controller.inject.js"],
	["controller/package/dist/controller.sw.js", "controller/controller.sw.js"],
	["scramjet-utils/package/dist/scramjet-utils.js", "scramjet-utils/scramjet-utils.js"],
	["libcurl-transport/package/dist/index.js", "libcurl/libcurl-client.js"],
];

if (!existsSync(DL)) {
	console.error("Vendor downloads missing. Run: npm start (once) then retry.");
	process.exit(1);
}

mkdirSync(OUT, { recursive: true });

for (const [src, dest] of MAP) {
	const from = join(DL, src);
	const to = join(OUT, dest);
	mkdirSync(dirname(to), { recursive: true });
	cpSync(from, to);
	console.log(`Copied ${dest}`);
}

cpSync(join(OUT, "controller/controller.sw.js"), join(__dirname, "riseub/sw.js"));
console.log("Copied sw.js");
