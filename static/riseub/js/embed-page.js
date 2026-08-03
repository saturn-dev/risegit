import { ensureScramjet, createBrowseFrame } from "./scramjet-shell.js";
import { readEmbedTarget } from "./embed-url.js";

const stage = document.getElementById("embed-stage");
const step = document.getElementById("embed-step");
const frame = document.getElementById("embed-frame");
const errorPanel = document.getElementById("embed-error");
const errorMsg = document.getElementById("embed-error-msg");
const retryBtn = document.getElementById("embed-retry");

function post(status, detail) {
	if (window.parent === window) return;
	window.parent.postMessage({ type: "riseub-embed", status, detail }, "*");
}

function setStep(text) {
	if (step) step.textContent = text;
}

function showError(message) {
	stage.hidden = true;
	errorPanel.hidden = false;
	errorMsg.textContent = message;
	post("error", message);
}

async function boot() {
	const target = readEmbedTarget();
	if (!target) {
		showError("No destination URL. Add #rv3… or ?$io=https://example.com");
		return;
	}

	setStep("starting…");
	post("progress", target);

	try {
		setStep("loading proxy…");
		await ensureScramjet();
		setStep("connecting…");
		createBrowseFrame(frame, {
			onUrl: (url) => {
				if (url) post("navigate", url);
			},
		}).go(target);

		frame.addEventListener(
			"load",
			() => {
				stage.hidden = true;
				post("ready", target);
			},
			{ once: true }
		);
	} catch (err) {
		showError(err?.message || "Proxy failed to start");
	}
}

retryBtn?.addEventListener("click", () => location.reload());
boot();
