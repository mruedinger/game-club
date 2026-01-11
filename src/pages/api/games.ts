import type { APIRoute } from "astro";
import { getRuntimeEnv, readSession } from "../../lib/auth";

type GameRow = {
	id: number;
	title: string;
	submitted_by_email: string;
	status: "backlog" | "current" | "played";
	created_at: string;
	cover_art_url?: string;
	tags_json?: string;
	description?: string;
	time_to_beat_minutes?: number;
	current_price_cents?: number;
	best_price_cents?: number;
	played_month?: string;
};

type D1Database = {
	prepare: (query: string) => {
		bind: (...args: unknown[]) => {
			all: <T>() => Promise<{ results: T[] }>;
		};
	};
};

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const db = getDb(env);
	if (!db) {
		return new Response("Games database not configured.", { status: 500 });
	}

	const { results } = await db
		.prepare(
			"select id, title, submitted_by_email, status, created_at, cover_art_url, tags_json, description, time_to_beat_minutes, current_price_cents, best_price_cents, played_month " +
				"from games order by status asc, title asc"
		)
		.bind()
		.all<GameRow>();

	const backlog = results.filter((game) => game.status === "backlog");
	const current = results.filter((game) => game.status === "current");
	const played = results.filter((game) => game.status === "played");

	return new Response(
		JSON.stringify({
			backlog,
			current,
			played
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" }
		}
	);
};

export const POST: APIRoute = async ({ request, locals }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const session = await readSession(request, env);
	if (!session) {
		return new Response("Authentication required.", { status: 401 });
	}

	const db = getDb(env);
	if (!db) {
		return new Response("Games database not configured.", { status: 500 });
	}

	const body = await readJson(request);
	const title = typeof body?.title === "string" ? body.title.trim() : "";
	if (!title) {
		return new Response("Title is required.", { status: 400 });
	}

	await db
		.prepare(
			"insert into games (title, submitted_by_email, status) values (?1, ?2, 'backlog')"
		)
		.bind(title, session.email.toLowerCase())
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

async function readJson(request: Request): Promise<{ title?: string } | null> {
	const text = await request.text();
	if (!text) return null;
	try {
		return JSON.parse(text) as { title?: string };
	} catch {
		return null;
	}
}
