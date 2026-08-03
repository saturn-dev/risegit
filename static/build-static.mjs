#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const node = process.execPath;

function run(script, args = []) {
	const res = spawnSync(node, [join(__dirname, script), ...args], {
		stdio: "inherit",
		cwd: join(__dirname, ".."),
	});
	if (res.status !== 0) process.exit(res.status ?? 1);
}

const targetIdx = process.argv.indexOf("--target");
const target = targetIdx >= 0 ? process.argv[targetIdx + 1] : "https://www.roblox.com/";

run("sync-public.mjs");
run("copy-vendor.mjs");
run("build-embed.mjs", ["--target", target, ...process.argv.slice(2).filter((a, i, arr) => {
	if (a === "--target") return false;
	if (i > 0 && arr[i - 1] === "--target") return false;
	return a !== "build-static.mjs";
})]);

console.log("\nDone. Push static/riseub/ and static/embed.svg to GitHub.");
