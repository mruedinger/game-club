import type { APIRoute } from "astro";
import { getRuntimeEnv } from "../../../lib/auth";

type D1Database = {
	prepare: (query: string) => {
		bind: (...args: unknown[]) => {
			first: <T>() => Promise<T | null>;
		};
	};
};

type GameRow = {
	id: number;
	title: string;
	submitted_by_email: string;
	submitted_by_name?: string;
	submitted_by_alias?: string;
	cover_art_url?: string;
	tags_json?: string;
	description?: string;
	current_price_cents?: number;
	best_price_cents?: number;
	steam_app_id?: number;
	itad_slug?: string;
};

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const db = getDb(env);
	if (!db) {
		return new Response("Games database not configured.", { status: 500 });
	}

	const current = await db
		.prepare(
			"select games.id, games.title, games.submitted_by_email, members.name as submitted_by_name, members.alias as submitted_by_alias, games.cover_art_url, games.tags_json, games.description, games.current_price_cents, games.best_price_cents, games.steam_app_id, games.itad_slug " +
				"from games left join members on members.email = games.submitted_by_email where games.status = 'current' limit 1"
		)
		.bind()
		.first<GameRow>();

	return new Response(JSON.stringify({ current }), {
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
