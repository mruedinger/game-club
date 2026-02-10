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

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const session = await readSession(request, env);
	if (!session) {
		return new Response("Authentication required.", { status: 401 });
	}

	const body = await readJson(request);
	const id = normalizeGameId(body?.id);
	const favorite = body?.favorite;
	if (!id || typeof favorite !== "boolean") {
		return new Response("Game id and favorite flag are required.", { status: 400 });
	}

	const db = getDb(env);
	if (!db) {
		return new Response("Games database not configured.", { status: 500 });
	}

	const game = await db
		.prepare("select id from games where id = ?1")
		.bind(id)
		.first<{ id: number }>();
	if (!game) {
		return new Response("Game not found.", { status: 404 });
	}

	const memberEmail = session.email.toLowerCase();
	const existingFavorite = await db
		.prepare("select game_id from game_favorites where game_id = ?1 and member_email = ?2")
		.bind(id, memberEmail)
		.first<{ game_id: number }>();
	const isFavorite = Boolean(existingFavorite);

	if (favorite) {
		await db
			.prepare(
				"insert into game_favorites (game_id, member_email) values (?1, ?2) on conflict(game_id, member_email) do nothing"
			)
			.bind(id, memberEmail)
			.run();
	} else {
		await db
			.prepare("delete from game_favorites where game_id = ?1 and member_email = ?2")
			.bind(id, memberEmail)
			.run();
	}

	if (isFavorite !== favorite) {
		await writeAudit(
			env,
			session.email,
			favorite ? "game_favorite_add" : "game_favorite_remove",
			"game",
			id,
			{ favorite: isFavorite },
			{ favorite }
		);
	}

	return new Response(null, { status: 204 });
};

function getDb(env: Record<string, unknown>): D1Database | undefined {
	const value = env.DB;
	if (value && typeof value === "object") {
		return value as D1Database;
	}
	return undefined;
}

async function readJson(
	request: Request
): Promise<{ id?: string | number; favorite?: boolean } | null> {
	const text = await request.text();
	if (!text) return null;
	try {
		return JSON.parse(text) as { id?: string | number; favorite?: boolean };
	} catch {
		return null;
	}
}

function normalizeGameId(value: unknown): number | null {
	if (typeof value === "number" && Number.isInteger(value)) return value;
	if (typeof value === "string") {
		const parsed = Number.parseInt(value, 10);
		if (!Number.isNaN(parsed)) return parsed;
	}
	return null;
}
