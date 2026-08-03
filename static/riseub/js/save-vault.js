const PASSPHRASE = "RiseUB-vault-v1";
const PREFIX = "riseub-";
const ACCESS_KEY = "riseub-access";

function assertCrypto() {
	if (!globalThis.crypto?.subtle) {
		throw new Error("Rise needs HTTPS. Open this site with https:// instead of http://.");
	}
}

function b64encode(bytes) {
	let bin = "";
	const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	view.forEach((b) => {
		bin += String.fromCharCode(b);
	});
	return btoa(bin);
}

function b64decode(str) {
	const bin = atob(str);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

function collectKeys() {
	const data = {};
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (!key) continue;
		if (key.startsWith(PREFIX) || key.toLowerCase().includes("riseub")) {
			data[key] = localStorage.getItem(key);
		}
	}
	return data;
}

async function deriveKey(passphrase, salt) {
	assertCrypto();
	const material = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(passphrase),
		"PBKDF2",
		false,
		["deriveKey"]
	);
	return crypto.subtle.deriveKey(
		{ name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" },
		material,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"]
	);
}

async function encryptPayload(obj) {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const key = await deriveKey(PASSPHRASE, salt);
	const plain = new TextEncoder().encode(JSON.stringify(obj));
	const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
	return {
		v: 1,
		salt: b64encode(salt),
		iv: b64encode(iv),
		data: b64encode(cipher),
	};
}

async function decryptPayload(wrapper) {
	if (!wrapper || wrapper.v !== 1 || !wrapper.salt || !wrapper.iv || !wrapper.data) {
		throw new Error("Not a valid RiseUB backup");
	}
	const salt = b64decode(wrapper.salt);
	const iv = b64decode(wrapper.iv);
	const data = b64decode(wrapper.data);
	const key = await deriveKey(PASSPHRASE, salt);
	let plain;
	try {
		plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
	} catch {
		throw new Error("Could not decrypt this backup");
	}
	const parsed = JSON.parse(new TextDecoder().decode(plain));
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("Backup contents look wrong");
	}
	return parsed;
}

function looksLikeSeal(value) {
	if (!value) return false;
	if (typeof value === "object") return value.v === 1 && value.salt && value.iv && value.data;
	if (typeof value !== "string") return false;
	try {
		const parsed = JSON.parse(value);
		return looksLikeSeal(parsed);
	} catch {
		return false;
	}
}

/** Encrypt and store the signup token used for this profile. */
export async function storeAccessToken(token, role) {
	const sealed = await encryptPayload({ token: String(token || ""), role: role || "standard" });
	localStorage.setItem(ACCESS_KEY, JSON.stringify(sealed));
}

/**
 * Read the sealed signup token from localStorage (or from a vault key map).
 * Accepts sealed JSON, a seal object, or a legacy plaintext UUID.
 */
export async function readAccessToken(raw = localStorage.getItem(ACCESS_KEY)) {
	if (!raw) return null;

	// Legacy: bare UUID stored as the value.
	if (typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw.trim())) {
		return { token: raw.trim(), role: "standard" };
	}

	try {
		let wrapper = typeof raw === "string" ? JSON.parse(raw) : raw;

		// Accidentally double-stringified.
		if (typeof wrapper === "string") {
			if (/^[0-9a-f-]{36}$/i.test(wrapper.trim())) {
				return { token: wrapper.trim(), role: "standard" };
			}
			wrapper = JSON.parse(wrapper);
		}

		if (!looksLikeSeal(wrapper)) return null;
		const data = await decryptPayload(wrapper);

		// Seal held the token fields directly.
		if (data?.token) {
			return { token: String(data.token), role: data.role || "standard" };
		}

		// Seal accidentally wrapped another seal / string.
		if (typeof data === "string" && /^[0-9a-f-]{36}$/i.test(data.trim())) {
			return { token: data.trim(), role: "standard" };
		}
		if (data && looksLikeSeal(data)) {
			const nested = await decryptPayload(data);
			if (nested?.token) {
				return { token: String(nested.token), role: nested.role || "standard" };
			}
		}
		return null;
	} catch {
		return null;
	}
}

/** Download an encrypted `.save` of every riseub-* localStorage key. */
export async function exportVault() {
	const keys = collectKeys();
	const wrapper = await encryptPayload(keys);
	const blob = new Blob([JSON.stringify(wrapper)], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "riseub-backup.save";
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
	return Object.keys(keys).length;
}

/** Decrypt a `.save` file and return its key map (does not write yet). */
export async function readVaultFile(file) {
	const text = await file.text();
	let wrapper;
	try {
		wrapper = JSON.parse(text);
	} catch {
		throw new Error("That file is not a RiseUB backup");
	}
	const keys = await decryptPayload(wrapper);
	const names = Object.keys(keys);
	if (!names.length) throw new Error("Backup is empty");
	return keys;
}

/** Write a previously decrypted vault into localStorage. */
export function applyVaultKeys(keys) {
	for (const [key, value] of Object.entries(keys)) {
		if (typeof value !== "string") continue;
		try {
			localStorage.setItem(key, value);
		} catch {
			throw new Error("Browser storage is full - import failed");
		}
	}
	return Object.keys(keys).length;
}

/** Decrypt a `.save` file and write its keys into localStorage. */
export async function importVault(file) {
	const keys = await readVaultFile(file);
	return applyVaultKeys(keys);
}

async function verifyToken(token) {
	const res = await fetch("/api/auth/verify", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ token }),
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok || !data.ok) {
		throw new Error(data.error || "That token isn't valid.");
	}
	return data.role || "standard";
}

/**
 * Import from the login gate: validate a sealed (or pasted) token, restore
 * data, and report whether a profile came with it.
 */
export async function importVaultAtGate(file, fallbackToken = "") {
	const keys = await readVaultFile(file);
	if (!keys["riseub-profile"]) {
		throw new Error("That backup has no profile - use Continue instead");
	}

	let access = await readAccessToken(keys[ACCESS_KEY]);
	if (!access?.token && fallbackToken.trim()) {
		access = { token: fallbackToken.trim(), role: "standard" };
	}
	if (!access?.token) {
		throw new Error(
			"This backup has no access token - paste your token above, then import again"
		);
	}

	const role = await verifyToken(access.token);
	keys[ACCESS_KEY] = JSON.stringify(
		await encryptPayload({ token: access.token, role })
	);

	try {
		const profile = JSON.parse(keys["riseub-profile"]);
		profile.role = role;
		keys["riseub-profile"] = JSON.stringify(profile);
	} catch {}

	const n = applyVaultKeys(keys);
	return { count: n, role, hasProfile: true };
}
