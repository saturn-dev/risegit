#!/usr/bin/env node
/**
 * Build Rise SVG launcher — base href must be arctic-static-main ROOT on CDN
 * (proxy assets live at gh/.../arctic-static-main/, not under static/).
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GITHUB = "saturn-dev/risegit";
const BRANCH = "main";
const ROOT_SUBPATH = "arctic-static-main";
const EXAMPLE_SUBPATH = `${ROOT_SUBPATH}/example`;

function origins() {
	const base = `gh/${GITHUB}@${BRANCH}/${ROOT_SUBPATH}`;
	return [
		`https://cdn.jsdelivr.net/${base}`,
		`https://testingcf.jsdelivr.net/${base}`,
		`https://gcore.jsdelivr.net/${base}`,
		`https://cdn.statically.io/${base}`,
	];
}

const htmlB64 = Buffer.from(readFileSync(join(__dirname, "index.html"), "utf8")).toString("base64");
const originsJson = JSON.stringify(origins());

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style="position:fixed;top:0;left:0">
  <foreignObject x="0" y="0" width="100%" height="100%">
    <body xmlns="http://www.w3.org/1999/xhtml" style="margin:0;background:#0a0c0b">
      <iframe id="rise-embed-frame" allow="autoplay; fullscreen; clipboard-read; clipboard-write; encrypted-media; picture-in-picture" style="position:fixed;inset:0;width:100%;height:100%;border:none"></iframe>
      <script><![CDATA[
        (function(){
          function dec(b){var s=atob(b);var a=new Uint8Array(s.length);for(var i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return new TextDecoder().decode(a);}
          var frame=document.getElementById("rise-embed-frame");
          var html=dec(${JSON.stringify(htmlB64)});
          var base=new URL("./",location.href).href.replace(/\\/+$/,"");
          var origins=${originsJson};
          var p=new URLSearchParams(location.search);
          var h=location.hash.slice(1)||p.get("h")||"";
          function targetOf(v){if(!v)return "";if(v.slice(0,4)==="aw1."){try{var q=v.slice(4).replace(/-/g,"+").replace(/_/g,"/"),s=atob(q+"=".repeat((4-q.length%4)%4)),a=new Uint8Array(s.length);for(var i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return new TextDecoder().decode(a)}catch(e){return ""}}if(v.slice(0,4)!=="rv3."){try{return decodeURIComponent(v)}catch(e){return v}}try{var q=v.slice(4),k=[215,109,196,84,233,61,142,52,178,73,201,25],a=new Uint8Array(q.length/2);if(!/^(?:[0-9a-f]{2})+$/i.test(q))return "";for(var i=0;i<a.length;i++)a[i]=parseInt(q.slice(i*2,i*2+2),16)^(k[i%k.length]^((41+(i%k.length)*17)&255))^((41+i*29)&255);return new TextDecoder("utf-8",{fatal:true}).decode(a)}catch(e){return ""}}
          var target=h?targetOf(h):(p.get("$io")||p.get("url")||"");
          window.addEventListener("message",function(e){if(frame&&e.source===frame.contentWindow&&window.parent!==window){window.parent.postMessage(e.data,"*");}});
          if(origins.indexOf(base)<0)origins.push(base);
          function fallback(origin){
            origin=origin.replace(/\\/+$/,"");
            var head='<base href="'+origin+'/"/>'+'<'+'script>window.__RISE_EMBED_TARGET='+JSON.stringify(target)+';<'+'/script>';
            frame.srcdoc=html.replace("<head>","<head>"+head);
          }
          function tryOrigin(i){if(i>=origins.length){fallback(base);return}var origin=origins[i].replace(/\\/+$/,"");var c=new AbortController(),t=setTimeout(function(){c.abort()},8000);fetch(origin+"/assets/resolver-kJ4LsXVq.js?z="+Date.now(),{cache:"no-store",mode:"cors",signal:c.signal}).then(function(r){clearTimeout(t);if(r.ok){fallback(origin)}else{tryOrigin(i+1)}}).catch(function(){clearTimeout(t);tryOrigin(i+1)})}
          tryOrigin(0);
        })();
      ]]></script>
    </body>
  </foreignObject>
</svg>
`;

writeFileSync(join(__dirname, "embed.svg"), svg, "utf8");
writeFileSync(join(__dirname, "svg.svg"), svg, "utf8");

const repoRoot = join(__dirname, "..", "..", "..", "arctic-static-main", "example");
mkdirSync(repoRoot, { recursive: true });
for (const name of ["index.html", "rise-app.js", "rise.css", "embed.svg", "svg.svg", "build.mjs"]) {
	cpSync(join(__dirname, name), join(repoRoot, name));
}

console.log(`Wrote embed.svg + svg.svg (${(svg.length / 1024).toFixed(1)} KB)`);
console.log(`Synced to arctic-static-main/example/`);
console.log(`\nCDN URL:`);
console.log(`  https://cdn.jsdelivr.net/gh/${GITHUB}@${BRANCH}/${EXAMPLE_SUBPATH}/embed.svg`);
