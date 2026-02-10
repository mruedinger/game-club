import type { APIRoute } from "astro";
import { getRuntimeEnv, readSession } from "../../../lib/auth";
import { writeAudit } from "../../../lib/audit";

type D1Database = {
	prepare: (query: string) => {
		bind: (...args: unknown[]) => {
			first: <T>() => Promise<T | null>;
			all: <T>() => Promise<{ results: T[] }>;
			run: () => Promise<{ success: boolean }>;
		};
	};
};

type RatingSummary = {
	rating_count: number;
	rating_average: number | null;
};

type IndividualRatingRow = {
	member_display_name: string;
	rating: number;
	created_at: string;
	updated_at: string;
};

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const db = getDb(env);
	if (!db) {
		return new Response("Games database not configured.", { status: 500 });
	}

	const id = normalizeGameId(new URL(request.url).searchParams.get("id"));
	if (!id) {
		return new Response("Game id is required.", { status: 400 });
	}

	const game = await db
		.prepare("select id from games where id = ?1")
		.bind(id)
		.first<{ id: number }>();
	if (!game) {
		return new Response("Game not found.", { status: 404 });
	}

	const summary = await getRatingSummary(db, id);
	const session = await readSession(request, env);
	if (!session) {
		return jsonResponse(
			{
				game_id: id,
				rating_count: summary.rating_count,
				rating_average: summary.rating_average,
				my_rating: null,
				ratings: []
			},
			200
		);
	}

	const memberEmail = session.email.toLowerCase();
	const myRating = await db
		.prepare("select rating from game_ratings where game_id = ?1 and member_email = ?2")
		.bind(id, memberEmail)
		.first<{ rating: number }>();
	const individualRatings = await db
		.prepare(
			"select " +
				"coalesce(nullif(trim(members.alias), ''), nullif(trim(substr(members.name, 1, instr(members.name || ' ', ' ') - 1)), ''), 'Member') as member_display_name, " +
				"game_ratings.rating, game_ratings.created_at, game_ratings.updated_at " +
				"from game_ratings " +
				"left join members on members.email = game_ratings.member_email " +
				"where game_ratings.game_id = ?1 " +
				"order by game_ratings.rating desc, member_display_name asc, game_ratings.updated_at desc"
		)
		.bind(id)
		.all<IndividualRatingRow>();

	return jsonResponse({
		game_id: id,
		rating_count: summary.rating_count,
		rating_average: summary.rating_average,
		my_rating: myRating?.rating ?? null,
		ratings: individualRatings.results
	});
};

export const POST: APIRoute = async ({ request, locals }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const session = await readSession(request, env);
	if (!session) {
		return new Response("Authentication required.", { status: 401 });
	}

	const body = await readJson(request);
	const id = normalizeGameId(body?.id);
	const rating = normalizeRating(body?.rating);
	if (!id || rating === undefined) {
		return new Response("Game id and valid rating are required.", { status: 400 });
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
	const existing = await db
		.prepare("select rating from game_ratings where game_id = ?1 and member_email = ?2")
		.bind(id, memberEmail)
		.first<{ rating: number }>();
	const beforeRating = existing?.rating ?? null;

	if (rating === null) {
		await db
			.prepare("delete from game_ratings where game_id = ?1 and member_email = ?2")
			.bind(id, memberEmail)
			.run();
	} else {
		await db
			.prepare(
				"insert into game_ratings (game_id, member_email, rating) values (?1, ?2, ?3) " +
					"on conflict(game_id, member_email) do update set rating = excluded.rating, updated_at = datetime('now')"
			)
			.bind(id, memberEmail, rating)
			.run();
	}

	const changed = beforeRating !== rating;
	if (changed) {
		await writeAudit(
			env,
			session.email,
			rating === null ? "game_rating_clear" : "game_rating_set",
			"game",
			id,
			{ rating: beforeRating },
			{ rating }
		);
	}

	const summary = await getRatingSummary(db, id);
	return jsonResponse(
		{
			game_id: id,
			rating_count: summary.rating_count,
			rating_average: summary.rating_average,
			my_rating: rating
		},
		200
	);
};

async function getRatingSummary(db: D1Database, gameId: number): Promise<RatingSummary> {
	const summary = await db
		.prepare(
			"select count(*) as rating_count, avg(rating) as rating_average from game_ratings where game_id = ?1"
		)
		.bind(gameId)
		.first<RatingSummary>();
	return {
		rating_count: summary?.rating_count ?? 0,
		rating_average: summary?.rating_average ?? null
	};
}

function getDb(env: Record<string, unknown>): D1Database | undefined {
	const value = env.DB;
	if (value && typeof value === "object") {
		return value as D1Database;
	}
	return undefined;
}

function jsonResponse(payload: unknown, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "private, no-store"
		}
	});
}

async function readJson(
	request: Request
): Promise<{ id?: string | number; rating?: string | number | null } | null> {
	const text = await request.text();
	if (!text) return null;
	try {
		return JSON.parse(text) as { id?: string | number; rating?: string | number | null };
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

function normalizeRating(value: unknown): number | null | undefined {
	if (value === null || value === "") return null;
	if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5) {
		return value;
	}
	if (typeof value === "string") {
		const trimmed = value.trim().toLowerCase();
		if (!trimmed) return null;
		if (trimmed === "null") return null;
		const parsed = Number.parseInt(trimmed, 10);
		if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 5) return parsed;
	}
	return undefined;
}
