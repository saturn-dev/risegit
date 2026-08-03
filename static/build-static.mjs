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
const target = targetIdx >= 0 ? process.argv[targetIdx + 1] : "";

run("sync-public.mjs");
run("copy-vendor.mjs");
const embedArgs = ["--github", "saturn-dev/risegit", ...process.argv.slice(2).filter((a, i, arr) => {
	if (a === "--target") return false;
	if (i > 0 && arr[i - 1] === "--target") return false;
	return a !== "build-static.mjs";
})];
if (target) embedArgs.push("--target", target);
run("build-embed.mjs", embedArgs);

console.log("\nDone. Push static/riseub/ and static/embed.svg to GitHub.");
