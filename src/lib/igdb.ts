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

	if (!steamAppId) {
		console.warn(`[IGDB] missing steam app id for "${title}"`);
		return null;
	}

	const gameId = await resolveGameIdBySteamId(
		steamAppId,
		clientId,
		accessToken
	);
	if (!gameId) {
		console.warn(`[IGDB] no match for "${title}"`);
		return null;
	}

	const timeToBeat = await fetchTimeToBeatByGameId(
		gameId,
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
		body: `fields game; where external_game_source = 1 & uid = "${steamAppId}"; limit 1;`
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
