#!/usr/bin/env node
/**
 * Build Arctic-style CDN embed SVGs for RiseUB (jsDelivr / Wayground).
 * The proxy runs fully from GitHub CDN — no VPS iframe.
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { encodeRv3 } from "./rv3-lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CDN_DIR = join(ROOT, "arctic-static-main");
const EMBED_HTML = join(CDN_DIR, "embed.html");

const DEFAULT_GITHUB = "saturn-dev/riseUB";
const CDN_SUBPATH = "arctic-static-main";

function parseArgs(argv) {
	const out = {
		github: DEFAULT_GITHUB,
		branch: "main",
		target: "https://www.roblox.com/",
		output: join(CDN_DIR, "embed.svg"),
		fPath: "",
	};
	for (let i = 2; i < argv.length; i += 1) {
		const a = argv[i];
		if (a === "--github") out.github = (argv[++i] || DEFAULT_GITHUB).replace(/\/+$/, "");
		else if (a === "--branch") out.branch = argv[++i] || "main";
		else if (a === "--target") out.target = normalize(argv[++i] || out.target);
		else if (a === "--out") out.output = argv[++i] || out.output;
		else if (a === "--f-path") out.fPath = argv[++i] || "";
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
	console.log(`Build RiseUB CDN embed SVGs (Arctic-style, jsDelivr host).

Usage:
  node static/build-embed.mjs [options]

Options:
  --github USER/REPO   GitHub repo (default: saturn-dev/riseUB)
  --branch BRANCH      Git branch (default: main)
  --target URL         Destination site (default: https://www.roblox.com/)
  --out FILE           Main embed.svg path (default: arctic-static-main/embed.svg)
  --f-path DIR         Also write f/{a}/{b}/rv3.{hash} launcher (optional dir hint)

Examples:
  node static/build-embed.mjs --target https://roblox.com
  node static/build-embed.mjs --target youtube.com --github saturn-dev/riseUB
`);
}

function cdnOrigins(github, branch) {
	const base = `gh/${github}@${branch}/${CDN_SUBPATH}`;
	return [
		`https://cdn.jsdelivr.net/${base}`,
		`https://testingcf.jsdelivr.net/${base}`,
		`https://gcore.jsdelivr.net/${base}`,
		`https://cdn.statically.io/${base}`,
	];
}

function buildSvg({ embedHtmlB64, origins, fallbackHash }) {
	const originsJson = JSON.stringify(origins);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style="position:fixed;top:0;left:0">
  <foreignObject x="0" y="0" width="100%" height="100%">
    <body xmlns="http://www.w3.org/1999/xhtml" style="margin:0">
      <iframe id="riseub-embed-frame" allow="autoplay; fullscreen; clipboard-read; clipboard-write; encrypted-media; picture-in-picture" style="position:fixed;inset:0;width:100%;height:100%;border:none"></iframe>
      <script><![CDATA[
        (function(){
          function dec(b){var s=atob(b);var a=new Uint8Array(s.length);for(var i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return new TextDecoder().decode(a);}
          var frame=document.getElementById("riseub-embed-frame");
          var html=dec(${JSON.stringify(embedHtmlB64)});
          var base=new URL("./",location.href).href.replace(/\\/+$/,"");
          var origins=${originsJson};
          var p=new URLSearchParams(location.search);
          var h=location.hash.slice(1)||p.get("h")||${JSON.stringify(fallbackHash)};
          function targetOf(v){if(v.slice(0,4)==="aw1."){try{var q=v.slice(4).replace(/-/g,"+").replace(/_/g,"/"),s=atob(q+"=".repeat((4-q.length%4)%4)),a=new Uint8Array(s.length);for(var i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return new TextDecoder().decode(a)}catch(e){return ""}}if(v.slice(0,4)!=="rv3."){try{return decodeURIComponent(v)}catch(e){return v}}try{var q=v.slice(4),k=[215,109,196,84,233,61,142,52,178,73,201,25],a=new Uint8Array(q.length/2);if(!/^(?:[0-9a-f]{2})+$/i.test(q))return "";for(var i=0;i<a.length;i++)a[i]=parseInt(q.slice(i*2,i*2+2),16)^(k[i%k.length]^((41+(i%k.length)*17)&255))^((41+i*29)&255);return new TextDecoder("utf-8",{fatal:true}).decode(a)}catch(e){return ""}}
          var target=h?targetOf(h):(p.get("$io")||p.get("url")||"");
          window.addEventListener("message",function(e){if(frame&&e.source===frame.contentWindow&&window.parent!==window){window.parent.postMessage(e.data,"*");}});
          if(origins.indexOf(base)<0)origins.push(base);
          function fallback(origin){var head='<base href="'+origin+'/"/>'+'<'+'script>window.__ARCTIC_EMBED_TARGET='+JSON.stringify(target)+';window.__ARCTIC_EMBED_BACKEND='+JSON.stringify(p.get("backend")||"scramjet2")+';window.__ARCTIC_EMBED_PALETTE='+JSON.stringify(p.get("palette")||"")+';</'+'script>';frame.srcdoc=html.replace("<head>","<head>"+head);}
          function tryOrigin(index){if(index>=origins.length){fallback(base);return}var origin=origins[index].replace(/\\/+$/,"");var c=new AbortController(),t=setTimeout(function(){c.abort()},5000);fetch(origin+"/embed.svg?z="+Date.now(),{cache:"no-store",mode:"cors",signal:c.signal}).then(function(r){clearTimeout(t);if(r.ok&&((r.headers.get("content-type")||"").indexOf("image/svg+xml")>=0)){fallback(origin)}else{tryOrigin(index+1)}}).catch(function(){clearTimeout(t);tryOrigin(index+1)})}
          tryOrigin(0);
        })();
      ]]></script>
    </body>
  </foreignObject>
</svg>
`;
}

function randId(len = 8) {
	return randomBytes(Math.ceil(len / 2))
		.toString("hex")
		.slice(0, len);
}

const opts = parseArgs(process.argv);
const hash = encodeRv3(opts.target);
const embedHtml = readFileSync(EMBED_HTML, "utf8");
const embedHtmlB64 = Buffer.from(embedHtml, "utf8").toString("base64");
const origins = cdnOrigins(opts.github, opts.branch);
const svg = buildSvg({ embedHtmlB64, origins, fallbackHash: hash });

mkdirSync(dirname(opts.output), { recursive: true });
writeFileSync(opts.output, svg, "utf8");

const segA = opts.fPath ? opts.fPath.split("/")[0] : randId(8);
const segB = opts.fPath ? opts.fPath.split("/")[1] || randId(8) : randId(8);
const fLauncher = join(CDN_DIR, "f", segA, segB, hash);
mkdirSync(dirname(fLauncher), { recursive: true });
writeFileSync(fLauncher, svg, "utf8");

console.log(`Wrote ${opts.output}`);
console.log(`Wrote ${fLauncher}`);
console.log(`Target: ${opts.target}`);
console.log(`Hash:   ${hash}`);

const cdnBase = origins[0];
console.log(`\njsDelivr (main embed):`);
console.log(`  ${cdnBase}/embed.svg#${hash}`);
console.log(`  ${cdnBase}/embed.svg?$io=${encodeURIComponent(opts.target)}`);
console.log(`\njsDelivr (f-path, Arctic-style):`);
console.log(`  ${cdnBase}/f/${segA}/${segB}/${hash}?$io=${encodeURIComponent(opts.target)}`);
console.log(`\nPush arctic-static-main/ to GitHub (${opts.github}) then open the URLs above.`);
