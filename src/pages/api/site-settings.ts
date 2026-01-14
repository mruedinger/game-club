import type { APIRoute } from "astro";
import { getRuntimeEnv, readSession } from "../../lib/auth";
import { writeAudit } from "../../lib/audit";

type D1Database = {
	prepare: (query: string) => {
		bind: (...args: unknown[]) => {
			first: <T>() => Promise<T | null>;
			run: () => Promise<{ success: boolean }>;
		};
	};
};

type SettingRow = {
	value: string;
};

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const db = getDb(env);
	if (!db) {
		return new Response("Settings database not configured.", { status: 500 });
	}

	const row = await db
		.prepare("select value from site_settings where key = ?1")
		.bind("next_meeting")
		.first<SettingRow>();

	return new Response(
		JSON.stringify({ next_meeting: row?.value || null }),
		{ status: 200, headers: { "Content-Type": "application/json" } }
	);
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
	const value = typeof body?.next_meeting === "string" ? body.next_meeting.trim() : "";
	if (!value) {
		return new Response("next_meeting is required.", { status: 400 });
	}

	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return new Response("Invalid datetime.", { status: 400 });
	}

	const db = getDb(env);
	if (!db) {
		return new Response("Settings database not configured.", { status: 500 });
	}

	const existing = await db
		.prepare("select value from site_settings where key = ?1")
		.bind("next_meeting")
		.first<SettingRow>();

	await db
		.prepare(
			"insert into site_settings (key, value, updated_at) values (?1, ?2, datetime('now')) " +
				"on conflict(key) do update set value = excluded.value, updated_at = datetime('now')"
		)
		.bind("next_meeting", value)
		.run();

	await writeAudit(
		env,
		session.email,
		"update_next_meeting",
		"site_setting",
		0,
		{ next_meeting: existing?.value || null },
		{ next_meeting: value }
	);

	return new Response(null, { status: 204 });
};

function getDb(env: Record<string, unknown>): D1Database | undefined {
	const value = env.DB;
	if (value && typeof value === "object") {
		return value as D1Database;
	}
	return undefined;
}

async function readJson(request: Request): Promise<{ next_meeting?: string } | null> {
	const text = await request.text();
	if (!text) return null;
	try {
		return JSON.parse(text) as { next_meeting?: string };
	} catch {
		return null;
	}
}
