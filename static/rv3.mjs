#!/usr/bin/env node
import { encodeRv3, decodeRv3 } from "./rv3-lib.mjs";

function usage() {
	console.log(`Usage:
  node static/rv3.mjs encode "https://roblox.com"
  node static/rv3.mjs decode rv3.bf6598f8...
`);
}

const [,, cmd, arg] = process.argv;
if (cmd === "encode" && arg) {
	const url = arg.startsWith("http") ? arg : `https://${arg}`;
	console.log(encodeRv3(url));
} else if (cmd === "decode" && arg) {
	console.log(decodeRv3(arg));
} else {
	usage();
	process.exit(cmd ? 1 : 0);
}
