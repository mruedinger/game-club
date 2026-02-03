type IgdbGame = {
	id: number;
	name: string;
	slug?: string;
};

type IgdbExternalGame = {
	game?: number;
};

type IgdbTimeToBeat = {
	normally?: number;
};

type CachedToken = {
	value: string;
	expiresAt: number;
};

let cachedToken: CachedToken | null = null;

export async function fetchIgdbTimeMinutes(
	env: Record<string, unknown>,
	title: string,
	steamAppId?: number | null
): Promise<number | null> {
	const clientId = getEnv(env, "IGDB_CLIENT_ID");
	const accessToken = await getAccessToken(env);
	if (!clientId || !accessToken) {
		console.warn("[IGDB] missing credentials");
		return null;
	}

	const gameId = steamAppId
		? await resolveGameIdBySteamId(steamAppId, clientId, accessToken)
		: null;
	const game = gameId
		? { id: gameId, name: title }
		: await searchGame(title, clientId, accessToken);
	if (!game) {
		console.warn(`[IGDB] no match for "${title}"`);
		return null;
	}

	const timeToBeat = await fetchTimeToBeatByGameId(
		game.id,
		clientId,
		accessToken
	);
	if (!timeToBeat?.normally) {
		console.warn(`[IGDB] no time to beat for "${title}"`);
		return null;
	}

	const minutes = Math.round(timeToBeat.normally / 60);
	if (!Number.isFinite(minutes) || minutes <= 0) {
		console.warn(`[IGDB] invalid time to beat for "${title}"`);
		return null;
	}

	return minutes;
}

async function searchGame(
	title: string,
	clientId: string,
	accessToken: string
): Promise<IgdbGame | null> {
	const normalizedTitle = normalizeTitle(title);
	const queries = [
		title,
		stripDiacritics(title),
		stripSymbols(stripDiacritics(title))
	].filter(
		(value, index, all) => all.indexOf(value) === index
	);
	const whereClauses = ["where game_type = 0;", ""];
	let data: IgdbGame[] = [];

	for (const query of queries) {
		for (const where of whereClauses) {
			const response = await fetch("https://api.igdb.com/v4/games", {
				method: "POST",
				headers: {
					"Client-ID": clientId,
					Authorization: `Bearer ${accessToken}`
				},
				body: `fields id,name,slug,game_type; search "${escapeIgdbSearch(query)}"; ${where} limit 5;`
			});
			if (!response.ok) {
				console.warn(
					`[IGDB] search status ${response.status} ${await readErrorBody(response)}`
				);
				return null;
			}
			data = (await response.json()) as IgdbGame[];
			if (data?.length) break;
		}
		if (data?.length) break;
	}

	if (!data?.length) return null;
	const exactNameMatch = data.find(
		(game) => normalizeTitle(game.name) === normalizedTitle
	);
	const exactSlugMatch = data.find(
		(game) => normalizeTitle(game.slug ?? "") === normalizedTitle
	);
	const match = exactNameMatch ?? exactSlugMatch ?? data[0];
	console.log(`[IGDB] match "${match.name}" (${match.id})`);
	return match;
}

async function resolveGameIdBySteamId(
	steamAppId: number,
	clientId: string,
	accessToken: string
): Promise<number | null> {
	const response = await fetch("https://api.igdb.com/v4/external_games", {
		method: "POST",
		headers: {
			"Client-ID": clientId,
			Authorization: `Bearer ${accessToken}`
		},
		body: `fields game; where category = 1 & uid = "${steamAppId}"; limit 1;`
	});
	if (!response.ok) {
		console.warn(
			`[IGDB] external lookup status ${response.status} ${await readErrorBody(response)}`
		);
		return null;
	}
	const data = (await response.json()) as IgdbExternalGame[];
	const gameId = data?.[0]?.game;
	if (!gameId) {
		console.warn(`[IGDB] no external match for steam app ${steamAppId}`);
		return null;
	}
	return gameId;
}

async function fetchTimeToBeatByGameId(
	gameId: number,
	clientId: string,
	accessToken: string
): Promise<IgdbTimeToBeat | null> {
	const response = await fetch("https://api.igdb.com/v4/game_time_to_beats", {
		method: "POST",
		headers: {
			"Client-ID": clientId,
			Authorization: `Bearer ${accessToken}`
		},
		body: `fields normally; where game_id = ${gameId}; limit 1;`
	});
	if (!response.ok) {
		console.warn(
			`[IGDB] time-to-beat(game) status ${response.status} ${await readErrorBody(response)}`
		);
		return null;
	}
	const data = (await response.json()) as IgdbTimeToBeat[];
	return data?.[0] ?? null;
}

async function getAccessToken(env: Record<string, unknown>) {
	const tokenOverride = getEnv(env, "IGDB_ACCESS_TOKEN");
	if (tokenOverride) return tokenOverride;

	const clientId = getEnv(env, "IGDB_CLIENT_ID");
	const clientSecret = getEnv(env, "IGDB_CLIENT_SECRET");
	if (!clientId || !clientSecret) return null;

	const now = Date.now();
	if (cachedToken && cachedToken.expiresAt > now + 30_000) {
		return cachedToken.value;
	}

	const url = new URL("https://id.twitch.tv/oauth2/token");
	url.searchParams.set("client_id", clientId);
	url.searchParams.set("client_secret", clientSecret);
	url.searchParams.set("grant_type", "client_credentials");

	const response = await fetch(url.toString(), { method: "POST" });
	if (!response.ok) {
		console.warn(`[IGDB] token status ${response.status}`);
		return null;
	}

	const data = (await response.json()) as { access_token?: string; expires_in?: number };
	if (!data.access_token || !data.expires_in) return null;

	cachedToken = {
		value: data.access_token,
		expiresAt: now + data.expires_in * 1000
	};

	return cachedToken.value;
}

function escapeIgdbSearch(value: string) {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').trim();
}

function normalizeTitle(value: string) {
	return value
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function stripDiacritics(value: string) {
	return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function stripSymbols(value: string) {
	return value.replace(/[™®©]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
}

async function readErrorBody(response: Response) {
	try {
		const text = await response.text();
		return text ? `- ${text}` : "";
	} catch {
		return "";
	}
}

function getEnv(env: Record<string, unknown>, key: string) {
	const value = env[key];
	return typeof value === "string" && value.length > 0 ? value : null;
}
