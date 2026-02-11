import type { APIRoute } from "astro";
import { getRuntimeEnv, readSession } from "../../lib/auth";
import { writeAudit } from "../../lib/audit";
import { fetchExternalGameMetadata } from "../../lib/game-metadata";

type GameRow = {
	id: number;
	title: string;
	submitted_by_name?: string;
	submitted_by_alias?: string;
	status: "backlog" | "current" | "played";
	poll_eligible?: number | null;
	is_mine?: number;
	created_at: string;
	cover_art_url?: string;
	itad_boxart_url?: string;
	tags_json?: string;
	description?: string;
	time_to_beat_minutes?: number;
	steam_review_score?: number;
	steam_review_desc?: string;
	lifetime_poll_points?: number;
	current_price_cents?: number;
	best_price_cents?: number;
	played_month?: string;
	steam_app_id?: number;
	itad_game_id?: string;
	itad_slug?: string;
	price_checked_at?: string;
	is_favorite?: number;
	rating_count?: number;
	rating_average?: number;
	my_rating?: number;
};

type D1Database = {
	prepare: (query: string) => {
		bind: (...args: unknown[]) => {
			all: <T>() => Promise<{ results: T[] }>;
			first: <T>() => Promise<T | null>;
			run: () => Promise<{ success: boolean; meta?: { changes?: number } }>;
		};
	};
	batch: (
		statements: Array<{
			all: <T>() => Promise<{ results: T[] }>;
			first: <T>() => Promise<T | null>;
			run: () => Promise<{ success: boolean; meta?: { changes?: number } }>;
		}>
	) => Promise<unknown>;
};

export const prerender = false;

export const GET: APIRoute = async ({ locals, request }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const db = getDb(env);
	if (!db) {
		return new Response("Games database not configured.", { status: 500 });
	}
	const session = await readSession(request, env);
	const memberEmail = session?.email?.toLowerCase() ?? "";

	const { results } = await db
		.prepare(
			"select games.id, games.title, members.name as submitted_by_name, members.alias as submitted_by_alias, games.status, games.created_at, games.cover_art_url, games.itad_boxart_url, games.tags_json, games.description, games.time_to_beat_minutes, games.steam_review_score, games.steam_review_desc, games.current_price_cents, games.best_price_cents, games.played_month, games.steam_app_id, games.itad_game_id, games.itad_slug, " +
				"games.poll_eligible, case when ?1 != '' and games.submitted_by_email = ?1 then 1 else 0 end as is_mine, " +
				"case when game_favorites.game_id is null then 0 else 1 end as is_favorite " +
				", coalesce(game_poll_history_points.lifetime_poll_points, 0) as lifetime_poll_points " +
				", coalesce(game_rating_totals.rating_count, 0) as rating_count, game_rating_totals.rating_average as rating_average, my_game_rating.rating as my_rating " +
				"from games " +
				"left join members on members.email = games.submitted_by_email " +
				"left join game_favorites on game_favorites.game_id = games.id and game_favorites.member_email = ?1 " +
				"left join (" +
					"select poll_games.game_id as game_id, " +
					"sum(case when poll_votes.choice_1 = poll_games.game_id then 3 else 0 end + " +
					"case when poll_votes.choice_2 = poll_games.game_id then 2 else 0 end + " +
					"case when poll_votes.choice_3 = poll_games.game_id then 1 else 0 end) as lifetime_poll_points " +
					"from poll_games " +
					"join polls on polls.id = poll_games.poll_id and polls.status = 'closed' and polls.history_valid = 1 " +
					"left join poll_votes on poll_votes.poll_id = poll_games.poll_id " +
					"group by poll_games.game_id" +
				") as game_poll_history_points on game_poll_history_points.game_id = games.id " +
				"left join (select game_id, count(*) as rating_count, avg(rating) as rating_average from game_ratings group by game_id) as game_rating_totals on game_rating_totals.game_id = games.id " +
				"left join game_ratings as my_game_rating on my_game_rating.game_id = games.id and my_game_rating.member_email = ?1 " +
				"order by games.status asc, games.title asc"
		)
		.bind(memberEmail)
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
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "private, no-store"
			}
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
	const steamAppId = normalizeSteamAppId(body?.steamAppId);

	const existingBySteam = steamAppId
		? await db
				.prepare("select id from games where steam_app_id = ?1 limit 1")
				.bind(steamAppId)
				.first<{ id: number }>()
		: null;
	if (existingBySteam) {
		return new Response("Game already exists in the backlog.", { status: 409 });
	}

	const fallbackTitle = typeof body?.title === "string" ? body.title.trim() : "";
	const metadata = steamAppId ? await fetchExternalGameMetadata(env, fallbackTitle, steamAppId) : null;
	const title = metadata?.title ?? fallbackTitle;
	if (!title) {
		return new Response("Title is required.", { status: 400 });
	}

	const existingByTitle = await db
		.prepare("select id from games where lower(title) = ?1 limit 1")
		.bind(title.toLowerCase())
		.first<{ id: number }>();
	if (existingByTitle) {
		return new Response("Game already exists in the backlog.", { status: 409 });
	}

	const coverArtUrl = metadata?.coverArtUrl ?? null;
	const description = metadata?.description ?? null;
	const tagsJson = metadata?.tagsJson ?? null;
	const ttbMinutes = metadata?.timeToBeatMinutes ?? null;
	const steamReviewScore = metadata?.steamReviewScore ?? null;
	const steamReviewDesc = metadata?.steamReviewDesc ?? null;
	const itadGameId = metadata?.itadGameId ?? null;
	const itadSlug = metadata?.itadSlug ?? null;
	const itadBoxartUrl = metadata?.itadBoxartUrl ?? null;
	const currentPriceCents = metadata?.currentPriceCents ?? null;
	const bestPriceCents = metadata?.bestPriceCents ?? null;

	let inserted: { id: number } | null = null;
	try {
		if (metadata?.hasPriceData) {
			inserted = await db
				.prepare(
					"insert into games (title, submitted_by_email, status, poll_eligible, cover_art_url, tags_json, description, steam_app_id, itad_game_id, itad_slug, itad_boxart_url, current_price_cents, best_price_cents, price_checked_at, time_to_beat_minutes, steam_review_score, steam_review_desc) values (?1, ?2, 'backlog', 0, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, datetime('now'), ?12, ?13, ?14) returning id"
				)
				.bind(
					title,
					session.email.toLowerCase(),
					coverArtUrl,
					tagsJson,
					description,
					steamAppId,
					itadGameId,
					itadSlug,
					itadBoxartUrl,
					currentPriceCents,
					bestPriceCents,
					ttbMinutes,
					steamReviewScore,
					steamReviewDesc
				)
				.first<{ id: number }>();
		} else {
			inserted = await db
				.prepare(
					"insert into games (title, submitted_by_email, status, poll_eligible, cover_art_url, tags_json, description, steam_app_id, itad_game_id, itad_slug, itad_boxart_url, current_price_cents, best_price_cents, price_checked_at, time_to_beat_minutes, steam_review_score, steam_review_desc) values (?1, ?2, 'backlog', 0, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, null, ?12, ?13, ?14) returning id"
				)
				.bind(
					title,
					session.email.toLowerCase(),
					coverArtUrl,
					tagsJson,
					description,
					steamAppId,
					itadGameId,
					itadSlug,
					itadBoxartUrl,
					currentPriceCents,
					bestPriceCents,
					ttbMinutes,
					steamReviewScore,
					steamReviewDesc
				)
				.first<{ id: number }>();
		}
	} catch (error) {
		const mapped = mapGameConstraintError(error);
		if (mapped) {
			return mapped;
		}
		throw error;
	}

	if (inserted?.id) {
		await writeAudit(
			env,
			session.email,
			"game_add",
			"game",
			inserted.id,
			null,
			{ id: inserted.id, title }
		);
	}

	return new Response(null, { status: 204 });
};

export const DELETE: APIRoute = async ({ request, locals }) => {
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
	const id = normalizeGameId(body?.id);
	if (!id) {
		return new Response("Game id is required.", { status: 400 });
	}

	const game = await db
		.prepare(
			"select id, title, submitted_by_email, status, played_month, steam_app_id from games where id = ?1"
		)
		.bind(id)
		.first<{ id: number; title: string; submitted_by_email: string; status: string; played_month?: string; steam_app_id?: number }>();
	if (!game) {
		return new Response("Game not found.", { status: 404 });
	}

	const isOwner = game.submitted_by_email === session.email.toLowerCase();
	const isAdmin = session.role === "admin";
	if (!isOwner && !isAdmin) {
		return new Response("Not authorized.", { status: 403 });
	}

	await db.batch([
		db
			.prepare("delete from poll_votes where choice_1 = ?1 or choice_2 = ?1 or choice_3 = ?1")
			.bind(id),
		db.prepare("delete from poll_games where game_id = ?1").bind(id),
		db.prepare("delete from game_favorites where game_id = ?1").bind(id),
		db.prepare("delete from game_ratings where game_id = ?1").bind(id),
		db.prepare("delete from games where id = ?1").bind(id)
	]);

	await writeAudit(
		env,
		session.email,
		"game_delete",
		"game",
		id,
		game,
		null
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

async function readJson(
	request: Request
): Promise<{
	title?: string;
	steamAppId?: string | number;
	id?: string | number;
	action?: string;
} | null> {
	const text = await request.text();
	if (!text) return null;
	try {
		return JSON.parse(text) as {
			title?: string;
			steamAppId?: string | number;
			id?: string | number;
			action?: string;
		};
	} catch {
		return null;
	}
}

function normalizeGameId(value: unknown): number | null {
	if (typeof value === "number" && Number.isInteger(value)) return value;
	if (typeof value === "string") {
		const parsed = Number.parseInt(value, 10);
		return Number.isNaN(parsed) ? null : parsed;
	}
	return null;
}

function normalizeSteamAppId(value: unknown): number | null {
	if (typeof value === "number" && Number.isInteger(value)) return value;
	if (typeof value === "string") {
		const parsed = Number.parseInt(value, 10);
		return Number.isNaN(parsed) ? null : parsed;
	}
	return null;
}

export const PATCH: APIRoute = async ({ request, locals }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const session = await readSession(request, env);
	if (!session) {
		return new Response("Authentication required.", { status: 401 });
	}
	if (session.role !== "admin") {
		return new Response("Not authorized.", { status: 403 });
	}

	const db = getDb(env);
	if (!db) {
		return new Response("Games database not configured.", { status: 500 });
	}

	const body = await readJson(request);
	const id = normalizeGameId(body?.id);
	if (!id) {
		return new Response("Game id is required.", { status: 400 });
	}

	if (body?.action !== "set-current") {
		return new Response("Unsupported action.", { status: 400 });
	}

	const playedMonth = getCurrentMonth();

	const existing = await db
		.prepare("select id, title, status, played_month from games where id = ?1")
		.bind(id)
		.first<{ id: number; title: string; status: string; played_month?: string }>();
	if (!existing) {
		return new Response("Game not found.", { status: 404 });
	}

	try {
		await db.batch([
			db
				.prepare(
					"update games set status = 'played', poll_eligible = null, played_month = coalesce(played_month, ?1) where status = 'current' and id != ?2 and exists(select 1 from games where id = ?2)"
				)
				.bind(playedMonth, id),
			db.prepare("update games set status = 'current', poll_eligible = null, played_month = ?1 where id = ?2").bind(
				playedMonth,
				id
			)
		]);
	} catch (error) {
		const mapped = mapGameConstraintError(error);
		if (mapped) {
			return mapped;
		}
		throw error;
	}

	await writeAudit(
		env,
		session.email,
		"game_set_current",
		"game",
		id,
		existing,
		{ id, status: "current", played_month: playedMonth }
	);

	return new Response(null, { status: 204 });
};

function getCurrentMonth() {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	return `${year}-${month}`;
}

function mapGameConstraintError(error: unknown): Response | null {
	const message = getErrorMessage(error).toLowerCase();
	if (!message.includes("constraint")) {
		return null;
	}

	if (
		message.includes("idx_games_title_normalized_unique") ||
		message.includes("games.title") ||
		message.includes("lower(title)")
	) {
		return new Response("Game already exists in the backlog.", { status: 409 });
	}
	if (
		message.includes("idx_games_steam_app_id_unique") ||
		message.includes("games.steam_app_id")
	) {
		return new Response("Game already exists in the backlog.", { status: 409 });
	}
	if (message.includes("idx_games_single_current") || message.includes("games.status")) {
		return new Response("Another game is already set as current.", { status: 409 });
	}

	return null;
}

function getErrorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error ?? "");
}
