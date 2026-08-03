import { riseLogo } from "./logo.js";
import { icon } from "./icons.js";
import { createProfile, hasProfile, reloadProfile } from "./profile.js";
import { importVaultAtGate, storeAccessToken } from "./save-vault.js";

const AVATAR_SIZE = 256;

async function sha256(text) {
	if (!globalThis.crypto?.subtle) {
		throw new Error("Rise needs HTTPS. Open this site with https:// instead of http://.");
	}
	const data = new TextEncoder().encode(text);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** Squash whatever they picked down to a small square data URL. */
function readAvatar(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(new Error("Could not read that file"));
		reader.onload = () => {
			const image = new Image();
			image.onerror = () => reject(new Error("That file isn't an image"));
			image.onload = () => {
				const side = Math.min(image.width, image.height);
				const canvas = document.createElement("canvas");
				canvas.width = AVATAR_SIZE;
				canvas.height = AVATAR_SIZE;
				const ctx = canvas.getContext("2d");
				ctx.drawImage(
					image,
					(image.width - side) / 2,
					(image.height - side) / 2,
					side,
					side,
					0,
					0,
					AVATAR_SIZE,
					AVATAR_SIZE
				);
				resolve(canvas.toDataURL("image/webp", 0.85));
			};
			image.src = reader.result;
		};
		reader.readAsDataURL(file);
	});
}

/**
 * Full-screen gate shown until an account exists. Nothing behind it is
 * reachable - there is no guest mode.
 */
export function requireAccount() {
	return new Promise((resolve) => {
		if (window.__RISEUB_STATIC || window.__RISEUB_SKIP_GATE || window.__RISEUB_EMBED_TARGET) {
			resolve(false);
			return;
		}
		if (hasProfile()) {
			resolve(false);
			return;
		}

		let step = 1;
		let avatarData = null;
		let verifiedToken = "";
		let verifiedRole = "standard";

		const root = document.createElement("div");
		root.className = "gate";
		document.body.appendChild(root);
		document.body.classList.add("is-gated");

		function finish() {
			root.classList.add("is-done");
			setTimeout(() => {
				root.remove();
				document.body.classList.remove("is-gated");
				resolve(true);
			}, 520);
		}

		/** Spec rows down the left rail. Plain facts, no sales copy. */
		const FACTS = [
			["Storage", "This device"],
			["Access", "Invite token"],
			["Profile", "One per browser"],
		];

		function paint() {
			root.innerHTML = `
				<aside class="gate__aside">
					<div class="gate__mark">${riseLogo({ cls: "gate__logo" })}</div>
					<div class="gate__pitch">
						<h2>Everything runs<br />on your machine.</h2>
						<p>Your profile, saves and history stay in this browser. No server ever sees them.</p>
					</div>
					<dl class="gate__facts">
						${FACTS.map(
							([k, v]) => `<div class="gate__fact"><dt>${k}</dt><dd>${v}</dd></div>`
						).join("")}
					</dl>
				</aside>

				<main class="gate__main">
					<div class="gate__panel">
						<ol class="gate__track">
							<li class="gate__tick${step === 1 ? " on" : ""}${step > 1 ? " done" : ""}">
								<span>01</span>Access
							</li>
							<li class="gate__tick${step === 2 ? " on" : ""}">
								<span>02</span>Profile
							</li>
						</ol>
						${step === 1 ? stepToken() : stepAccount()}
					</div>
				</main>`;
			bind();
		}

		function stepToken() {
			return `
				<h1 class="gate__title">Enter your token</h1>
				<p class="gate__sub">Rise is invite only. Paste the token you were given.</p>
				<form class="gate__form" data-token-form>
					<label class="field-label" for="gate-token">Token</label>
					<input id="gate-token" class="field-input gate__input" type="password" autocomplete="off"
						spellcheck="false" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" required />
					<p class="gate__error" data-error hidden></p>
					<button type="submit" class="gate__go">
						<span>Continue</span>
						${icon("arrowRight")}
					</button>
				</form>
				<p class="gate__alt">
					Already have a backup?
					<button type="button" data-import>${icon("upload")}Restore a .save file</button>
				</p>
				<input type="file" accept=".save" hidden data-import-file />`;
		}

		function stepAccount() {
			return `
				<h1 class="gate__title">Set up your profile</h1>
				<p class="gate__sub">Pick a name and a password. Both stay on this device.</p>
				<form class="gate__form" data-account-form>
					<div class="gate__avatar-row">
						<label class="gate__avatar" tabindex="0">
							<input type="file" accept="image/*" data-avatar hidden />
							<span class="gate__avatar-img" data-avatar-preview>${icon("plus")}</span>
							<span class="gate__avatar-hint">Picture</span>
						</label>
						<div class="gate__fields">
							<label class="field-label" for="gate-user">Username</label>
							<input id="gate-user" class="field-input" type="text" maxlength="24" required
								autocomplete="off" spellcheck="false" placeholder="John Doe" />
							<label class="field-label" for="gate-pass">Password</label>
							<input id="gate-pass" class="field-input" type="password" minlength="4" required
								autocomplete="new-password" placeholder="At least 4 characters" />
						</div>
					</div>
					<p class="gate__error" data-error hidden></p>
					<button type="submit" class="gate__go">
						<span>Create profile</span>
						${icon("check")}
					</button>
				</form>`;
		}

		function showError(message) {
			const box = root.querySelector("[data-error]");
			if (!box) return;
			box.textContent = message;
			box.hidden = !message;
			if (message) {
				const panel = root.querySelector(".gate__panel");
				panel.classList.remove("shake");
				void panel.offsetWidth;
				panel.classList.add("shake");
			}
		}

		function bind() {
			const tokenForm = root.querySelector("[data-token-form]");
			if (tokenForm) {
				tokenForm.addEventListener("submit", async (e) => {
					e.preventDefault();
					const input = tokenForm.querySelector("input");
					const button = tokenForm.querySelector("button");
					button.disabled = true;
					button.classList.add("is-busy");
					showError("");

					try {
						const token = input.value.trim();
						const res = await fetch("/api/auth/verify", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ token }),
						});
						const data = await res.json().catch(() => ({}));
						if (!res.ok || !data.ok) {
							throw new Error(data.error || "That token isn't valid.");
						}
						verifiedToken = token;
						verifiedRole = data.role || "standard";
						await storeAccessToken(verifiedToken, verifiedRole);
						step = 2;
						paint();
					} catch (err) {
						showError(err.message);
						button.disabled = false;
						button.classList.remove("is-busy");
					}
				});

				const fileInput = root.querySelector("[data-import-file]");
				const tokenInput = root.querySelector("#gate-token");
				root.querySelector("[data-import]")?.addEventListener("click", () => fileInput?.click());
				fileInput?.addEventListener("change", async () => {
					const file = fileInput.files?.[0];
					fileInput.value = "";
					if (!file) return;
					showError("");
					const importBtn = root.querySelector("[data-import]");
					if (importBtn) importBtn.disabled = true;
					try {
						await importVaultAtGate(file, tokenInput?.value || "");
						reloadProfile();
						if (!hasProfile()) {
							throw new Error("Could not restore the profile from that backup");
						}
						location.reload();
					} catch (err) {
						showError(err.message);
						if (importBtn) importBtn.disabled = false;
					}
				});

				setTimeout(() => tokenForm.querySelector("input").focus(), 300);
				return;
			}

			const accountForm = root.querySelector("[data-account-form]");
			const fileInput = accountForm.querySelector("[data-avatar]");
			const preview = accountForm.querySelector("[data-avatar-preview]");

			accountForm.querySelector(".gate__avatar").addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					fileInput.click();
				}
			});

			fileInput.addEventListener("change", async () => {
				const file = fileInput.files?.[0];
				if (!file) return;
				try {
					avatarData = await readAvatar(file);
					preview.innerHTML = `<img src="${avatarData}" alt="" />`;
					preview.classList.add("has-image");
				} catch (err) {
					showError(err.message);
				}
			});

			accountForm.addEventListener("submit", async (e) => {
				e.preventDefault();
				const username = accountForm.querySelector("#gate-user").value.trim();
				const password = accountForm.querySelector("#gate-pass").value;

				if (username.length < 2) {
					showError("Pick a username with at least 2 characters.");
					return;
				}
				if (password.length < 4) {
					showError("Passwords need at least 4 characters.");
					return;
				}

				createProfile({
					username,
					passwordHash: await sha256(password),
					avatar: avatarData,
					role: verifiedRole,
				});

				if (verifiedToken) {
					await storeAccessToken(verifiedToken, verifiedRole);
				}

				finish();
			});

			setTimeout(() => accountForm.querySelector("#gate-user").focus(), 300);
		}

		paint();
		setTimeout(() => root.classList.add("is-open"), 20);
	});
}
