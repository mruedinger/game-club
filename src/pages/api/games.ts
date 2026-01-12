import type { APIRoute } from "astro";
import { getRuntimeEnv, readSession } from "../../lib/auth";
import { fetchItadGame, fetchItadPrices } from "../../lib/itad";

type GameRow = {
	id: number;
	title: string;
	submitted_by_email: string;
	submitted_by_name?: string;
	submitted_by_alias?: string;
	status: "backlog" | "current" | "played";
	created_at: string;
	cover_art_url?: string;
	tags_json?: string;
	description?: string;
	time_to_beat_minutes?: number;
	current_price_cents?: number;
	best_price_cents?: number;
	played_month?: string;
	steam_app_id?: number;
	itad_game_id?: string;
	itad_slug?: string;
	price_checked_at?: string;
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
			"select games.id, games.title, games.submitted_by_email, members.name as submitted_by_name, members.alias as submitted_by_alias, games.status, games.created_at, games.cover_art_url, games.tags_json, games.description, games.time_to_beat_minutes, games.current_price_cents, games.best_price_cents, games.played_month, games.steam_app_id, games.itad_game_id, games.itad_slug " +
				"from games left join members on members.email = games.submitted_by_email order by games.status asc, games.title asc"
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
	const steamAppId = normalizeSteamAppId(body?.steamAppId);
	const steamData = steamAppId ? await fetchSteamDetails(steamAppId) : null;
	const itadGame = steamAppId ? await fetchItadGame(env, steamAppId) : null;
	const itadPrices = itadGame?.id ? await fetchItadPrices(env, itadGame.id) : null;
	const title =
		steamData?.name ??
		(typeof body?.title === "string" ? body.title.trim() : "");
	if (!title) {
		return new Response("Title is required.", { status: 400 });
	}

	const coverArtUrl = steamData?.capsule_image ?? null;
	const description = steamData?.short_description ?? null;
	const tagsJson =
		steamData?.genres && steamData.genres.length > 0
			? JSON.stringify(steamData.genres.map((genre) => genre.description))
			: null;
	const currentPriceCents = itadPrices?.currentPriceCents ?? null;
	const bestPriceCents = itadPrices?.bestPriceCents ?? null;
	const priceCheckedAt = itadPrices ? new Date().toISOString() : null;

	await db
		.prepare(
			"insert into games (title, submitted_by_email, status, cover_art_url, tags_json, description, steam_app_id, itad_game_id, itad_slug, current_price_cents, best_price_cents, price_checked_at) values (?1, ?2, 'backlog', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)"
		)
		.bind(
			title,
			session.email.toLowerCase(),
			coverArtUrl,
			tagsJson,
			description,
			steamAppId,
			itadGame?.id ?? null,
			itadGame?.slug ?? null,
			currentPriceCents,
			bestPriceCents,
			priceCheckedAt
		)
		.run();

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

	const owner = await db
		.prepare("select submitted_by_email from games where id = ?1")
		.bind(id)
		.first<{ submitted_by_email: string }>();
	if (!owner) {
		return new Response("Game not found.", { status: 404 });
	}

	const isOwner = owner.submitted_by_email === session.email.toLowerCase();
	const isAdmin = session.role === "admin";
	if (!isOwner && !isAdmin) {
		return new Response("Not authorized.", { status: 403 });
	}

	await db.prepare("delete from games where id = ?1").bind(id).run();
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

	await db
		.prepare(
			"update games set status = 'played', played_month = coalesce(played_month, ?1) where status = 'current' and id != ?2"
		)
		.bind(playedMonth, id)
		.run();

	await db
		.prepare("update games set status = 'current', played_month = ?1 where id = ?2")
		.bind(playedMonth, id)
		.run();

	return new Response(null, { status: 204 });
};

function getCurrentMonth() {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	return `${year}-${month}`;
}

type SteamGenre = { description: string };
type SteamAppDetails = {
	name?: string;
	capsule_image?: string;
	short_description?: string;
	genres?: SteamGenre[];
};

async function fetchSteamDetails(
	appId: number
): Promise<SteamAppDetails | null> {
	const response = await fetch(
		`https://store.steampowered.com/api/appdetails?appids=${appId}&cc=us&l=en`
	);
	if (!response.ok) return null;
	const payload = (await response.json()) as Record<
		string,
		{ success: boolean; data?: SteamAppDetails }
	>;
	const entry = payload[String(appId)];
	if (!entry || !entry.success || !entry.data) return null;
	return entry.data;
}
