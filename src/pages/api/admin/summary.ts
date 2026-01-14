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
			"select email, name, alias, picture, role, active, created_at from members order by role asc, name is null, lower(name) asc, email asc"
		)
		.bind()
		.all<MemberRow>();

	return new Response(
		JSON.stringify({
			me: {
				email: session.email,
				name: session.name,
				alias: session.alias,
				role: session.role,
				picture: session.picture
			},
			members: results
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" }
		}
	);
};

function getDb(env: Record<string, unknown>): D1Database | undefined {
	const value = env.DB;
	if (value && typeof value === "object") {
		return value as D1Database;
	}
	return undefined;
}
