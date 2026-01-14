import type { APIRoute } from "astro";
import { createSession, getRuntimeEnv, readSession } from "../../lib/auth";
import { writeAudit } from "../../lib/audit";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const session = await readSession(request, env);
	if (!session) {
		return new Response("Authentication required.", { status: 401 });
	}
	return new Response(
		JSON.stringify({
			email: session.email,
			name: session.name,
			alias: session.alias,
			role: session.role,
			picture: session.picture
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" }
		}
	);
};

export const PATCH: APIRoute = async ({ request, locals }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const session = await readSession(request, env);
	if (!session) {
		return new Response("Authentication required.", { status: 401 });
	}

	const body = await readJson(request);
	if (!body || typeof body.alias !== "string") {
		return new Response("Alias is required.", { status: 400 });
	}

	const db = getDb(env);
	if (!db) {
		return new Response("Members database not configured.", { status: 500 });
	}

	const alias = body.alias.trim();
	const existing = await db
		.prepare("select email, alias from members where email = ?1")
		.bind(session.email.toLowerCase())
		.first<{ email: string; alias?: string }>();
	await db
		.prepare("update members set alias = ?1 where email = ?2")
		.bind(alias ? alias : null, session.email.toLowerCase())
		.run();

	const updatedSession = {
		...session,
		alias: alias ? alias : undefined
	};
	const secureCookie = new URL(request.url).protocol === "https:";
	const cookie = await createSession(env, updatedSession, secureCookie);
	await writeAudit(
		env,
		session.email,
		"member_alias_change",
		"member",
		0,
		existing,
		{ email: session.email.toLowerCase(), alias: alias ? alias : null }
	);

	return new Response(null, {
		status: 204,
		headers: {
			"Set-Cookie": cookie
		}
	});
};

type D1Database = {
	prepare: (query: string) => {
		bind: (...args: unknown[]) => {
			first: <T>() => Promise<T | null>;
			run: () => Promise<{ success: boolean }>;
		};
	};
};

function getDb(env: Record<string, unknown>): D1Database | undefined {
	const value = env.DB;
	if (value && typeof value === "object") {
		return value as D1Database;
	}
	return undefined;
}

async function readJson(request: Request): Promise<{ alias?: string } | null> {
	const text = await request.text();
	if (!text) return null;
	try {
		return JSON.parse(text) as { alias?: string };
	} catch {
		return null;
	}
}
