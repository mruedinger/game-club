import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type SessionRole = "admin" | "member";

type SessionCookieInput = {
	email: string;
	role: SessionRole;
	name?: string;
	alias?: string;
	picture?: string;
	now?: number;
};

const runtimeEnv = readDotEnv();
const SESSION_COOKIE_NAME = runtimeEnv.SESSION_COOKIE_NAME || process.env.SESSION_COOKIE_NAME || "gc_session";
const SESSION_SECRET =
	runtimeEnv.SESSION_SECRET || process.env.SESSION_SECRET || "e2e-session-secret";

export function createSessionCookie(input: SessionCookieInput) {
	const now = input.now ?? Date.now();
	const payload = {
		email: input.email,
		role: input.role,
		name: input.name,
		alias: input.alias,
		picture: input.picture,
		issuedAt: now,
		lastSeenAt: now,
		membershipCheckedAt: now,
		exp: now + 45 * 24 * 60 * 60 * 1000,
		absoluteExp: now + 180 * 24 * 60 * 60 * 1000
	};

	const encodedPayload = toBase64Url(JSON.stringify(payload));
	const signature = toBase64Url(
		createHmac("sha256", SESSION_SECRET).update(encodedPayload).digest()
	);
	return `${SESSION_COOKIE_NAME}=${encodedPayload}.${signature}`;
}

function toBase64Url(value: string | Buffer) {
	const buffer = typeof value === "string" ? Buffer.from(value, "utf8") : value;
	return buffer
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

function readDotEnv() {
	const envPath = resolve(process.cwd(), ".env");
	try {
		const text = readFileSync(envPath, "utf8");
		return text.split("\n").reduce<Record<string, string>>((acc, line) => {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) return acc;
			const separator = trimmed.indexOf("=");
			if (separator < 0) return acc;
			const key = trimmed.slice(0, separator).trim();
			const value = trimmed.slice(separator + 1).trim();
			if (!key) return acc;
			acc[key] = value;
			return acc;
		}, {});
	} catch {
		return {};
	}
}
