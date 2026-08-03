#!/usr/bin/env node
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeRv3 } from "./rv3-lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
	const out = {
		backend: "https://rise.odeatech.com",
		target: "https://www.roblox.com/",
		output: join(__dirname, "embed.svg"),
		github: "",
	};
	for (let i = 2; i < argv.length; i += 1) {
		const a = argv[i];
		if (a === "--backend") out.backend = argv[++i]?.replace(/\/+$/, "") || out.backend;
		else if (a === "--target") out.target = normalize(argv[++i] || out.target);
		else if (a === "--out") out.output = argv[++i] || out.output;
		else if (a === "--github") out.github = (argv[++i] || "").replace(/\/+$/, "");
		else if (a === "--help" || a === "-h") {
			printHelp();
			process.exit(0);
		}
	}
	return out;
}

function normalize(input) {
	const trimmed = String(input || "").trim();
	if (!trimmed) return "";
	if (/^https?:\/\//i.test(trimmed)) return trimmed;
	return `https://${trimmed.replace(/^\/+/, "")}`;
}

function printHelp() {
	console.log(`Build a Wayground / jsDelivr-compatible RiseUB embed SVG.

Usage:
  node static/build-embed.mjs [options]

Options:
  --backend URL   RiseUB server (default: https://rise.odeatech.com)
  --target URL    Site to open, e.g. roblox.com (default: https://www.roblox.com/)
  --out FILE      Output SVG path (default: static/embed.svg)
  --github USER/REPO  Print jsDelivr URL for gh/USER/REPO@main

Examples:
  node static/build-embed.mjs --target https://roblox.com
  node static/build-embed.mjs --target google.com --out static/embed-google.svg
  node static/build-embed.mjs --github YourName/riseUB
`);
}

function buildSvg(backend, hash) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style="position:fixed;top:0;left:0">
  <foreignObject x="0" y="0" width="100%" height="100%">
    <body xmlns="http://www.w3.org/1999/xhtml" style="margin:0;background:#0b1118">
      <iframe id="riseub-embed-frame" allow="autoplay; fullscreen; clipboard-read; clipboard-write; encrypted-media; picture-in-picture" style="position:fixed;inset:0;width:100%;height:100%;border:none"></iframe>
      <script><![CDATA[
        (function () {
          var backend = ${JSON.stringify(backend)};
          var fallback = ${JSON.stringify(hash)};
          var frame = document.getElementById("riseub-embed-frame");
          var p = new URLSearchParams(location.search);
          var h = location.hash.slice(1) || p.get("h") || fallback;
          var io = p.get("$io") || p.get("url") || "";
          frame.src = io
            ? backend.replace(/\\/+$/, "") + "/embed?$io=" + encodeURIComponent(io)
            : backend.replace(/\\/+$/, "") + "/embed#" + h;
          window.addEventListener("message", function (e) {
            if (frame && e.source === frame.contentWindow && window.parent !== window) {
              window.parent.postMessage(e.data, "*");
            }
          });
        })();
      ]]></script>
    </body>
  </foreignObject>
</svg>
`;
}

const opts = parseArgs(process.argv);
const hash = encodeRv3(opts.target);
const svg = buildSvg(opts.backend, hash);

mkdirSync(dirname(opts.output), { recursive: true });
writeFileSync(opts.output, svg, "utf8");

console.log(`Wrote ${opts.output}`);
console.log(`Target: ${opts.target}`);
console.log(`Hash:   ${hash}`);
console.log(`Embed:  ${opts.backend}/embed#${hash}`);
console.log(`Arctic-style query: ${opts.backend}/embed?%24io=${encodeURIComponent(opts.target)}`);

if (opts.github) {
	const base = `https://cdn.jsdelivr.net/gh/${opts.github}@main/static/embed.svg`;
	console.log(`jsDelivr: ${base}#${hash}`);
	console.log(`jsDelivr: ${base}?%24io=${encodeURIComponent(opts.target)}`);
}
