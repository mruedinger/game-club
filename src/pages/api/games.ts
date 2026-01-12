import type { APIRoute } from "astro";
import { getRuntimeEnv, readSession, getEnv } from "../../lib/auth";

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
			"select games.id, games.title, games.submitted_by_email, members.name as submitted_by_name, members.alias as submitted_by_alias, games.status, games.created_at, games.cover_art_url, games.tags_json, games.description, games.time_to_beat_minutes, games.current_price_cents, games.best_price_cents, games.played_month, games.steam_app_id " +
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
	const itadGameId = steamAppId ? await fetchItadGameId(env, steamAppId) : null;
	const itadPrices = itadGameId ? await fetchItadPrices(env, itadGameId) : null;
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

	await db
		.prepare(
			"insert into games (title, submitted_by_email, status, cover_art_url, tags_json, description, steam_app_id, current_price_cents, best_price_cents) values (?1, ?2, 'backlog', ?3, ?4, ?5, ?6, ?7, ?8)"
		)
		.bind(
			title,
			session.email.toLowerCase(),
			coverArtUrl,
			tagsJson,
			description,
			steamAppId,
			currentPriceCents,
			bestPriceCents
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
): Promise<{ title?: string; steamAppId?: string | number; id?: string | number } | null> {
	const text = await request.text();
	if (!text) return null;
	try {
		return JSON.parse(text) as {
			title?: string;
			steamAppId?: string | number;
			id?: string | number;
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

type ItadLookupResponse = {
	found: boolean;
	game?: {
		id?: string;
	};
};

type ItadPricesResponseItem = {
	id: string;
	historyLow?: {
		all?: { amountInt: number };
	};
	deals?: Array<{
		price?: { amountInt: number };
	}>;
};

type ItadPrices = {
	currentPriceCents: number | null;
	bestPriceCents: number | null;
};

async function fetchItadGameId(env: Record<string, unknown>, appId: number) {
	const apiKey = getEnv(env, "ITAD_API_KEY");
	if (!apiKey) return null;
	const url = new URL("https://api.isthereanydeal.com/games/lookup/v1");
	url.searchParams.set("key", apiKey);
	url.searchParams.set("appid", String(appId));
	const response = await fetch(url.toString());
	if (!response.ok) return null;
	const data = (await response.json()) as ItadLookupResponse;
	if (!data.found || !data.game?.id) return null;
	return data.game.id;
}

async function fetchItadPrices(env: Record<string, unknown>, gameId: string) {
	const apiKey = getEnv(env, "ITAD_API_KEY");
	if (!apiKey) return null;
	const url = new URL("https://api.isthereanydeal.com/games/prices/v3");
	url.searchParams.set("key", apiKey);
	url.searchParams.set("country", "US");
	const response = await fetch(url.toString(), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify([gameId])
	});
	if (!response.ok) return null;
	const data = (await response.json()) as ItadPricesResponseItem[];
	const entry = data?.[0];
	if (!entry) return null;
	const bestPriceCents = entry.historyLow?.all?.amountInt ?? null;
	const currentPriceCents = Array.isArray(entry.deals)
		? entry.deals.reduce<number | null>((lowest, deal) => {
				const value = deal.price?.amountInt;
				if (typeof value !== "number") return lowest;
				if (lowest === null || value < lowest) return value;
				return lowest;
		  }, null)
		: null;
	return {
		currentPriceCents,
		bestPriceCents
	} satisfies ItadPrices;
}
