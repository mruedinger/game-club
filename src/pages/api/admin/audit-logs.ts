import type { APIRoute } from "astro";
import { getRuntimeEnv, readSession } from "../../../lib/auth";

type D1Database = {
	prepare: (query: string) => {
		bind: (...args: unknown[]) => {
			all: <T>() => Promise<{ results: T[] }>;
		};
	};
};

type AuditRow = {
	id: number;
	actor_email: string;
	action: string;
	entity_type: string;
	entity_id: number;
	before_json?: string;
	after_json?: string;
	created_at: string;
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
		return new Response("Audit database not configured.", { status: 500 });
	}

	const { results } = await db
		.prepare(
			"select id, actor_email, action, entity_type, entity_id, before_json, after_json, created_at from audit_logs order by created_at desc limit 200"
		)
		.bind()
		.all<AuditRow>();

	return new Response(JSON.stringify(results), {
		status: 200,
		headers: { "Content-Type": "application/json" }
	});
};

function getDb(env: Record<string, unknown>): D1Database | undefined {
	const value = env.DB;
	if (value && typeof value === "object") {
		return value as D1Database;
	}
	return undefined;
}
