import type { APIRoute } from "astro";
import { getRuntimeEnv, readSession } from "../../../lib/auth";
import { writeAudit } from "../../../lib/audit";

type D1Database = {
	prepare: (query: string) => {
		bind: (...args: unknown[]) => {
			first: <T>() => Promise<T | null>;
			run: () => Promise<{ success: boolean }>;
		};
	};
};

type GameRow = {
	id: number;
	title: string;
	time_to_beat_seconds?: number | null;
};

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const session = await readSession(request, env);
	if (!session) {
		return new Response("Authentication required.", { status: 401 });
	}

	const body = await readJson(request);
	const id = normalizeId(body?.id);
	const hours = typeof body?.time_to_beat_hours === "number" ? body.time_to_beat_hours : null;
	if (!id || hours === null || Number.isNaN(hours) || hours < 0) {
		return new Response("Valid game id and hours are required.", { status: 400 });
	}

	const db = getDb(env);
	if (!db) {
		return new Response("Games database not configured.", { status: 500 });
	}

	const existing = await db
		.prepare("select id, title, time_to_beat_seconds from games where id = ?1")
		.bind(id)
		.first<GameRow>();
	if (!existing) {
		return new Response("Game not found.", { status: 404 });
	}
	if (typeof existing.time_to_beat_seconds === "number" && existing.time_to_beat_seconds > 0) {
		return new Response("Time to beat already set.", { status: 409 });
	}

	const seconds = Math.max(0, Math.round(hours * 3600));
	const normalizedSeconds = seconds > 0 ? seconds : null;
	await db
		.prepare("update games set time_to_beat_seconds = ?1 where id = ?2")
		.bind(normalizedSeconds, id)
		.run();

	await writeAudit(
		env,
		session.email,
		"game_ttb_set",
		"game",
		id,
		existing,
		{ id, title: existing.title, time_to_beat_seconds: normalizedSeconds }
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

function normalizeId(value: unknown): number | null {
	if (typeof value === "number" && Number.isInteger(value)) return value;
	if (typeof value === "string") {
		const parsed = Number.parseInt(value, 10);
		return Number.isNaN(parsed) ? null : parsed;
	}
	return null;
}

async function readJson(request: Request): Promise<{ id?: unknown; time_to_beat_hours?: unknown } | null> {
	const text = await request.text();
	if (!text) return null;
	try {
		return JSON.parse(text) as { id?: unknown; time_to_beat_hours?: unknown };
	} catch {
		return null;
	}
}
