import type { APIRoute } from "astro";
import { getRuntimeEnv, readSession } from "../../../lib/auth";

type MemberRow = {
	email: string;
	name?: string;
	alias?: string;
	picture?: string;
	role: "admin" | "member";
	active: number;
	created_at: string;
};

type D1Database = {
	prepare: (query: string) => {
		bind: (...args: unknown[]) => {
			all: <T>() => Promise<{ results: T[] }>;
			run: () => Promise<{ success: boolean }>;
		};
	};
};

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const session = await readSession(request, env);
	if (!session) {
		return new Response("Authentication required.", { status: 401 });
	}
	if (session.role !== "admin") {
		return new Response("Admin access required.", { status: 403 });
	}

	const db = getDb(env);
	if (!db) {
		return new Response("Members database not configured.", { status: 500 });
	}

	const { results } = await db
		.prepare(
			"select email, name, alias, picture, role, active, created_at from members order by active desc, email asc"
		)
		.bind()
		.all<MemberRow>();

	return new Response(JSON.stringify(results), {
		status: 200,
		headers: { "Content-Type": "application/json" }
	});
};

export const POST: APIRoute = async ({ request, locals }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const session = await readSession(request, env);
	if (!session) {
		return new Response("Authentication required.", { status: 401 });
	}
	if (session.role !== "admin") {
		return new Response("Admin access required.", { status: 403 });
	}

	const body = await readJson(request);
	const email = normalizeEmail(body?.email);
	const role = normalizeRole(body?.role);
	if (!email || !role) {
		return new Response("Email and role are required.", { status: 400 });
	}

	const db = getDb(env);
	if (!db) {
		return new Response("Members database not configured.", { status: 500 });
	}

	await db
		.prepare(
			"insert into members (email, name, alias, role, active) values (?1, null, null, ?2, 1) " +
				"on conflict(email) do update set role = excluded.role, active = 1"
		)
		.bind(email, role)
		.run();

	return new Response(null, { status: 204 });
};

export const PATCH: APIRoute = async ({ request, locals }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const session = await readSession(request, env);
	if (!session) {
		return new Response("Authentication required.", { status: 401 });
	}
	if (session.role !== "admin") {
		return new Response("Admin access required.", { status: 403 });
	}

	const body = await readJson(request);
	const email = normalizeEmail(body?.email);
	if (!email) {
		return new Response("Email is required.", { status: 400 });
	}
	const isSelf = email === session.email.toLowerCase();

	const updates: string[] = [];
	const values: unknown[] = [];

	if (body?.role) {
		if (isSelf) {
			return new Response("You cannot modify your own role.", { status: 403 });
		}
		const role = normalizeRole(body.role);
		if (!role) {
			return new Response("Invalid role.", { status: 400 });
		}
		updates.push(`role = ?${values.length + 1}`);
		values.push(role);
	}

	if (typeof body?.alias === "string") {
		updates.push(`alias = ?${values.length + 1}`);
		const alias = body.alias.trim();
		values.push(alias ? alias : null);
	}

	if (updates.length === 0) {
		return new Response("No updates provided.", { status: 400 });
	}

	const db = getDb(env);
	if (!db) {
		return new Response("Members database not configured.", { status: 500 });
	}

	const assignments = updates.join(", ");
	const sql = `update members set ${assignments} where email = ?${values.length + 1}`;
	values.push(email);

	await db
		.prepare(sql)
		.bind(...values)
		.run();

	return new Response(null, { status: 204 });
};

export const DELETE: APIRoute = async ({ request, locals }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const session = await readSession(request, env);
	if (!session) {
		return new Response("Authentication required.", { status: 401 });
	}
	if (session.role !== "admin") {
		return new Response("Admin access required.", { status: 403 });
	}

	const body = await readJson(request);
	const email = normalizeEmail(body?.email);
	if (!email) {
		return new Response("Email is required.", { status: 400 });
	}
	if (email === session.email.toLowerCase()) {
		return new Response("You cannot delete your own account.", { status: 403 });
	}

	const db = getDb(env);
	if (!db) {
		return new Response("Members database not configured.", { status: 500 });
	}

	await db
		.prepare("delete from members where email = ?1")
		.bind(email)
		.run();

	return new Response(null, { status: 204 });
};

function getDb(env: Record<string, unknown>): D1Database | undefined {
	const value = env.DB;
	if (value && typeof value === "object") {
		return value as D1Database;
	}
	return undefined;
}

async function readJson(request: Request): Promise<unknown> {
	const text = await request.text();
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

function normalizeEmail(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const email = value.trim().toLowerCase();
	if (!email || !email.includes("@")) return null;
	return email;
}

function normalizeRole(value: unknown): "admin" | "member" | null {
	if (value === "admin" || value === "member") return value;
	return null;
}
