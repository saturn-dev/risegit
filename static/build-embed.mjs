#!/usr/bin/env node
/**
 * Build RiseUB SVG embed launcher (Arctic-style thin SVG → iframe CDN index.html).
 */
import { writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { encodeRv3 } from "./rv3-lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CDN_DIR = join(__dirname, "riseub");

const DEFAULT_GITHUB = "saturn-dev/risegit";
const CDN_SUBPATH = "static/riseub";

function parseArgs(argv) {
	const out = {
		github: DEFAULT_GITHUB,
		branch: "main",
		target: "",
		output: join(__dirname, "embed.svg"),
		fPath: "",
	};
	for (let i = 2; i < argv.length; i += 1) {
		const a = argv[i];
		if (a === "--github") out.github = (argv[++i] || DEFAULT_GITHUB).replace(/\/+$/, "");
		else if (a === "--branch") out.branch = argv[++i] || "main";
		else if (a === "--target") out.target = normalize(argv[++i] || "");
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
	console.log(`Build RiseUB SVG embed (thin launcher → jsDelivr index.html).

Usage:
  node static/build-static.mjs
  node static/build-embed.mjs [--target https://example.com]
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

function buildSvg({ origins, fallbackHash }) {
	const originsJson = JSON.stringify(origins);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style="position:fixed;top:0;left:0">
  <foreignObject x="0" y="0" width="100%" height="100%">
    <body xmlns="http://www.w3.org/1999/xhtml" style="margin:0;background:#0b1118">
      <iframe id="riseub-embed-frame" allow="autoplay; fullscreen; clipboard-read; clipboard-write; encrypted-media; picture-in-picture" style="position:fixed;inset:0;width:100%;height:100%;border:none"></iframe>
      <script><![CDATA[
        (function(){
          var frame=document.getElementById("riseub-embed-frame");
          var origins=${originsJson};
          var p=new URLSearchParams(location.search);
          var h=location.hash.slice(1)||p.get("h")||${JSON.stringify(fallbackHash || "")};
          function targetOf(v){if(!v)return "";if(v.slice(0,4)==="aw1."){try{var q=v.slice(4).replace(/-/g,"+").replace(/_/g,"/"),s=atob(q+"=".repeat((4-q.length%4)%4)),a=new Uint8Array(s.length);for(var i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return new TextDecoder().decode(a)}catch(e){return ""}}if(v.slice(0,4)!=="rv3."){try{return decodeURIComponent(v)}catch(e){return v}}try{var q=v.slice(4),k=[215,109,196,84,233,61,142,52,178,73,201,25],a=new Uint8Array(q.length/2);if(!/^(?:[0-9a-f]{2})+$/i.test(q))return "";for(var i=0;i<a.length;i++)a[i]=parseInt(q.slice(i*2,i*2+2),16)^(k[i%k.length]^((41+(i%k.length)*17)&255))^((41+i*29)&255);return new TextDecoder("utf-8",{fatal:true}).decode(a)}catch(e){return ""}}
          var io=p.get("$io")||p.get("url")||"";
          var target=targetOf(h)||targetOf(io)||"";
          window.addEventListener("message",function(e){if(frame&&e.source===frame.contentWindow&&window.parent!==window){window.parent.postMessage(e.data,"*");}});
          function launch(origin){
            origin=origin.replace(/\\/+$/,"");
            var qs="static=1";
            if(io) qs+="&$io="+encodeURIComponent(io);
            else if(h) qs+="&h="+encodeURIComponent(h);
            var hashPart=(!io&&h)?("#"+h):"";
            frame.src=origin+"/index.html?"+qs+hashPart;
          }
          function tryOrigin(i){if(i>=origins.length){launch(origins[0]);return}var origin=origins[i].replace(/\\/+$/,"");var c=new AbortController(),t=setTimeout(function(){c.abort()},8000);fetch(origin+"/embed.svg?z="+Date.now(),{cache:"no-store",mode:"cors",signal:c.signal}).then(function(r){clearTimeout(t);if(r.ok){launch(origin)}else{tryOrigin(i+1)}}).catch(function(){clearTimeout(t);tryOrigin(i+1)})}
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
const hash = opts.target ? encodeRv3(opts.target) : "";
const origins = cdnOrigins(opts.github, opts.branch);
const svg = buildSvg({ origins, fallbackHash: hash });

mkdirSync(dirname(opts.output), { recursive: true });
writeFileSync(opts.output, svg, "utf8");
writeFileSync(join(CDN_DIR, "embed.svg"), svg, "utf8");
writeFileSync(join(__dirname, "..", "arctic-static-main", "embed.svg"), svg, "utf8");

if (hash) {
	const segA = opts.fPath ? opts.fPath.split("/")[0] : randId(8);
	const segB = opts.fPath ? opts.fPath.split("/")[1] || randId(8) : randId(8);
	const fLauncher = join(CDN_DIR, "f", segA, segB, hash);
	mkdirSync(dirname(fLauncher), { recursive: true });
	writeFileSync(fLauncher, svg, "utf8");
	console.log(`Wrote ${fLauncher}`);
}

console.log(`Wrote ${opts.output}`);
console.log(`Wrote ${join(CDN_DIR, "embed.svg")}`);
if (opts.target) console.log(`Target: ${opts.target}`);
if (hash) console.log(`Hash:   ${hash}`);

const repoBase = origins[0].replace(/\/static\/riseub$/, "");
console.log(`\nUse these URLs (NOT index.html directly):`);
console.log(`  ${repoBase}/static/embed.svg`);
console.log(`  ${origins[0]}/embed.svg`);
if (opts.target) {
	console.log(`  ${repoBase}/static/embed.svg?$io=${encodeURIComponent(opts.target)}`);
}
if (hash) console.log(`  ${repoBase}/static/embed.svg#${hash}`);
