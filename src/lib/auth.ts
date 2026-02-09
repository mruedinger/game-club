import { createRemoteJWKSet, jwtVerify } from "jose";

type AuthEnv = Record<string, unknown>;

type D1Database = {
	prepare: (query: string) => {
		bind: (...args: unknown[]) => {
			first: <T>(colName?: string) => Promise<T | null>;
			run: () => Promise<{ success: boolean }>;
		};
	};
};

type OAuthState = {
	state: string;
	nonce: string;
	codeVerifier: string;
	createdAt: number;
};

type SessionData = {
	email: string;
	name?: string;
	alias?: string;
	picture?: string;
	role: "admin" | "member";
	exp: number;
	issuedAt: number;
	lastSeenAt: number;
	membershipCheckedAt: number;
	absoluteExp: number;
};

type SessionInput = {
	email: string;
	name?: string;
	alias?: string;
	picture?: string;
	role: "admin" | "member";
	exp?: number;
	issuedAt?: number;
	lastSeenAt?: number;
	membershipCheckedAt?: number;
	absoluteExp?: number;
};

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const DEFAULT_SESSION_COOKIE = "gc_session";
const OAUTH_COOKIE = "gc_oauth";
const LEGACY_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const SESSION_IDLE_TTL_SECONDS = 60 * 60 * 24 * 45;
const SESSION_ABSOLUTE_TTL_SECONDS = 60 * 60 * 24 * 180;
const SESSION_MEMBERSHIP_RECHECK_SECONDS = 60 * 60;
const SESSION_ACTIVITY_TOUCH_SECONDS = 60 * 5;
const OAUTH_TTL_SECONDS = 60 * 10;

const jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
const pendingSessionCookies = new WeakMap<Request, string>();

export function getRuntimeEnv(localsEnv?: AuthEnv): AuthEnv {
	return (localsEnv ?? import.meta.env) as AuthEnv;
}

export async function buildGoogleAuthRedirect(
	env: AuthEnv,
	redirectUri: string,
	secureCookie: boolean
) {
	const clientId = getEnv(env, "GOOGLE_CLIENT_ID");
	if (!clientId) {
		throw new Error("Missing GOOGLE_CLIENT_ID.");
	}

	const state = randomString(32);
	const nonce = randomString(32);
	const codeVerifier = randomString(64);
	const codeChallenge = await sha256Base64Url(codeVerifier);

	const url = new URL(GOOGLE_AUTH_URL);
	url.searchParams.set("client_id", clientId);
	url.searchParams.set("redirect_uri", redirectUri);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("scope", "openid email profile");
	url.searchParams.set("state", state);
	url.searchParams.set("nonce", nonce);
	url.searchParams.set("code_challenge", codeChallenge);
	url.searchParams.set("code_challenge_method", "S256");
	url.searchParams.set("prompt", "select_account");

	const cookiePayload: OAuthState = {
		state,
		nonce,
		codeVerifier,
		createdAt: Date.now()
	};

	const cookie = await createSignedCookie(
		env,
		OAUTH_COOKIE,
		cookiePayload,
		OAUTH_TTL_SECONDS,
		secureCookie
	);

	return { url, cookie };
}

export async function exchangeGoogleCode(
	env: AuthEnv,
	redirectUri: string,
	code: string,
	oauthState: OAuthState
) {
	const clientId = getEnv(env, "GOOGLE_CLIENT_ID");
	const clientSecret = getEnv(env, "GOOGLE_CLIENT_SECRET");
	if (!clientId || !clientSecret) {
		throw new Error("Missing Google OAuth client credentials.");
	}

	const body = new URLSearchParams({
		code,
		client_id: clientId,
		client_secret: clientSecret,
		redirect_uri: redirectUri,
		grant_type: "authorization_code",
		code_verifier: oauthState.codeVerifier
	});

	const response = await fetch(GOOGLE_TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body
	});

	if (!response.ok) {
		const message = await response.text();
		throw new Error(`Token exchange failed: ${message}`);
	}

	const tokenSet = (await response.json()) as { id_token?: string };
	if (!tokenSet.id_token) {
		throw new Error("Missing id_token in token response.");
	}

	const { payload } = await jwtVerify(tokenSet.id_token, jwks, {
		issuer: GOOGLE_ISSUERS,
		audience: clientId
	});

	if (payload.nonce !== oauthState.nonce) {
		throw new Error("Invalid nonce.");
	}

	return {
		email: payload.email as string | undefined,
		name: payload.name as string | undefined,
		picture: payload.picture as string | undefined,
		emailVerified: payload.email_verified === true || payload.email_verified === "true"
	};
}

export async function getMember(env: AuthEnv, email: string) {
	const db = getDb(env);
	if (!db) {
		return null;
	}
	const row = await db
		.prepare("select email, name, alias, role from members where email = ?1 and active = 1")
		.bind(email.toLowerCase())
		.first<{ email: string; name?: string; alias?: string; role: "admin" | "member" }>();
	return row ?? null;
}

export async function updateMemberProfile(
	env: AuthEnv,
	email: string,
	name?: string,
	picture?: string
) {
	if (!name && !picture) {
		return;
	}
	const db = getDb(env);
	if (!db) {
		return;
	}
	const fields: string[] = [];
	const values: unknown[] = [];

	if (name) {
		fields.push(`name = ?${values.length + 1}`);
		values.push(name);
	}

	if (picture) {
		fields.push(`picture = ?${values.length + 1}`);
		values.push(picture);
	}

	const sql = `update members set ${fields.join(", ")} where email = ?${values.length + 1}`;
	values.push(email.toLowerCase());
	await db.prepare(sql).bind(...values).run();
}

export async function createSession(env: AuthEnv, data: SessionInput, secureCookie: boolean) {
	const now = Date.now();
	const session = toSessionData(data, now);
	if (!session) {
		throw new Error("Invalid session data.");
	}
	return createSignedCookie(
		env,
		getSessionCookieName(env),
		session,
		SESSION_IDLE_TTL_SECONDS,
		secureCookie
	);
}

export async function clearSession(env: AuthEnv, secureCookie: boolean) {
	return createClearedCookie(getSessionCookieName(env), secureCookie);
}

export async function clearOAuthState(secureCookie: boolean) {
	return createClearedCookie(OAUTH_COOKIE, secureCookie);
}

export async function readOAuthState(request: Request, env: AuthEnv) {
	const data = await readSignedCookie<OAuthState>(request, env, OAUTH_COOKIE);
	if (!data) {
		return null;
	}
	if (Date.now() - data.createdAt > OAUTH_TTL_SECONDS * 1000) {
		return null;
	}
	return data;
}

export async function readSession(request: Request, env: AuthEnv) {
	const raw = await readSignedCookie<SessionInput>(request, env, getSessionCookieName(env));
	if (!raw) {
		return null;
	}
	const data = toSessionData(raw, Date.now());
	if (!data) {
		await queueSessionClear(request, env);
		return null;
	}
	const now = Date.now();
	if (now > data.exp || now > data.absoluteExp || now - data.lastSeenAt > SESSION_IDLE_TTL_SECONDS * 1000) {
		await queueSessionClear(request, env);
		return null;
	}

	let next = data;
	let shouldSetCookie = !hasSessionMetadata(raw);
	const needsMembershipRecheck =
		now - data.membershipCheckedAt >= SESSION_MEMBERSHIP_RECHECK_SECONDS * 1000;

	if (needsMembershipRecheck) {
		const member = await getMember(env, data.email);
		if (!member) {
			await queueSessionClear(request, env);
			return null;
		}
		next = {
			...next,
			name: member.name || undefined,
			alias: member.alias || undefined,
			role: member.role,
			membershipCheckedAt: now
		};
		shouldSetCookie = true;
	}

	if (now - next.lastSeenAt >= SESSION_ACTIVITY_TOUCH_SECONDS * 1000) {
		next = {
			...next,
			lastSeenAt: now,
			exp: Math.min(next.absoluteExp, now + SESSION_IDLE_TTL_SECONDS * 1000)
		};
		shouldSetCookie = true;
	}

	if (shouldSetCookie) {
		const secureCookie = new URL(request.url).protocol === "https:";
		const cookie = await createSession(env, next, secureCookie);
		pendingSessionCookies.set(request, cookie);
	}

	return next;
}

export function consumePendingSessionCookie(request: Request) {
	const cookie = pendingSessionCookies.get(request) ?? null;
	pendingSessionCookies.delete(request);
	return cookie;
}

export function getRedirectUri(env: AuthEnv): string {
	const redirectUri = getEnv(env, "GOOGLE_REDIRECT_URI");
	if (!redirectUri) {
		throw new Error("Missing GOOGLE_REDIRECT_URI.");
	}
	return redirectUri;
}

export function getSessionCookieName(env: AuthEnv): string {
	return getEnv(env, "SESSION_COOKIE_NAME") || DEFAULT_SESSION_COOKIE;
}

function toSessionData(data: SessionInput, now: number): SessionData | null {
	const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
	if (!email) {
		return null;
	}
	if (data.role !== "admin" && data.role !== "member") {
		return null;
	}

	const issuedAt =
		readTimestamp(data.issuedAt) ??
		inferLegacyIssuedAt(readTimestamp(data.exp), now) ??
		now;
	const absoluteExp =
		readTimestamp(data.absoluteExp) ?? issuedAt + SESSION_ABSOLUTE_TTL_SECONDS * 1000;
	const lastSeenAt = clampTimestamp(
		readTimestamp(data.lastSeenAt) ?? issuedAt,
		issuedAt,
		now
	);
	const membershipCheckedAt = clampTimestamp(
		readTimestamp(data.membershipCheckedAt) ?? issuedAt,
		issuedAt,
		now
	);
	const exp = Math.min(
		readTimestamp(data.exp) ?? lastSeenAt + SESSION_IDLE_TTL_SECONDS * 1000,
		absoluteExp
	);

	return {
		email,
		name: typeof data.name === "string" ? data.name : undefined,
		alias: typeof data.alias === "string" ? data.alias : undefined,
		picture: typeof data.picture === "string" ? data.picture : undefined,
		role: data.role,
		exp,
		issuedAt,
		lastSeenAt,
		membershipCheckedAt,
		absoluteExp
	};
}

function hasSessionMetadata(data: SessionInput) {
	return (
		typeof data.issuedAt === "number" &&
		typeof data.lastSeenAt === "number" &&
		typeof data.membershipCheckedAt === "number" &&
		typeof data.absoluteExp === "number"
	);
}

async function queueSessionClear(request: Request, env: AuthEnv) {
	const secureCookie = new URL(request.url).protocol === "https:";
	const cookie = await clearSession(env, secureCookie);
	pendingSessionCookies.set(request, cookie);
}

function inferLegacyIssuedAt(exp: number | null, now: number) {
	if (!exp) {
		return null;
	}
	const inferred = exp - LEGACY_SESSION_TTL_SECONDS * 1000;
	if (!Number.isFinite(inferred) || inferred <= 0 || inferred > now) {
		return null;
	}
	return inferred;
}

function readTimestamp(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		return null;
	}
	return value;
}

function clampTimestamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

async function createSignedCookie(
	env: AuthEnv,
	name: string,
	data: object,
	maxAgeSeconds: number,
	secureCookie: boolean
) {
	const secret = getEnv(env, "SESSION_SECRET");
	if (!secret) {
		throw new Error("Missing SESSION_SECRET.");
	}
	const payload = base64UrlEncode(JSON.stringify(data));
	const signature = await sign(payload, secret);
	const value = `${payload}.${signature}`;
	return serializeCookie(name, value, {
		httpOnly: true,
		secure: secureCookie,
		sameSite: "Lax",
		path: "/",
		maxAge: maxAgeSeconds
	});
}

async function readSignedCookie<T>(
	request: Request,
	env: AuthEnv,
	name: string
): Promise<T | null> {
	const secret = getEnv(env, "SESSION_SECRET");
	if (!secret) {
		throw new Error("Missing SESSION_SECRET.");
	}
	const cookies = parseCookies(request.headers.get("Cookie") || "");
	const value = cookies[name];
	if (!value) {
		return null;
	}
	const [payload, signature] = value.split(".");
	if (!payload || !signature) {
		return null;
	}
	const expected = await sign(payload, secret);
	if (!timingSafeEqual(signature, expected)) {
		return null;
	}
	const decoded = base64UrlDecode(payload);
	try {
		return JSON.parse(decoded) as T;
	} catch {
		return null;
	}
}

function createClearedCookie(name: string, secureCookie: boolean) {
	return serializeCookie(name, "", {
		httpOnly: true,
		secure: secureCookie,
		sameSite: "Lax",
		path: "/",
		maxAge: 0
	});
}

function serializeCookie(
	name: string,
	value: string,
	options: {
		httpOnly?: boolean;
		secure?: boolean;
		sameSite?: "Lax" | "Strict" | "None";
		path?: string;
		maxAge?: number;
	}
) {
	const parts = [`${name}=${value}`];
	if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
	if (options.path) parts.push(`Path=${options.path}`);
	if (options.httpOnly) parts.push("HttpOnly");
	if (options.secure) parts.push("Secure");
	if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
	return parts.join("; ");
}

function parseCookies(header: string): Record<string, string> {
	return header.split(";").reduce((acc, part) => {
		const [key, ...rest] = part.trim().split("=");
		if (!key) return acc;
		acc[key] = rest.join("=");
		return acc;
	}, {} as Record<string, string>);
}

function getEnv(env: AuthEnv, key: string): string | undefined {
	const value = env[key];
	if (typeof value === "string") {
		return value;
	}
	return undefined;
}

function getDb(env: AuthEnv): D1Database | undefined {
	const value = env.DB;
	if (value && typeof value === "object") {
		return value as D1Database;
	}
	return undefined;
}

function randomString(bytes: number): string {
	const buffer = new Uint8Array(bytes);
	crypto.getRandomValues(buffer);
	return base64UrlEncode(buffer);
}

async function sha256Base64Url(value: string): Promise<string> {
	const data = new TextEncoder().encode(value);
	const hash = await crypto.subtle.digest("SHA-256", data);
	return base64UrlEncode(new Uint8Array(hash));
}

async function sign(value: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	);
	const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
	return base64UrlEncode(new Uint8Array(signature));
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i += 1) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

function base64UrlEncode(data: string | Uint8Array): string {
	const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): string {
	const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
	const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return new TextDecoder().decode(bytes);
}
