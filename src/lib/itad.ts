import { fetchWithTimeoutRetry } from "./http";

type ItadLookupResponse = {
	found: boolean;
	game?: {
		id?: string;
		slug?: string;
		assets?: {
			boxart?: string;
		};
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

export type ItadPrices = {
	currentPriceCents: number | null;
	bestPriceCents: number | null;
};

export async function fetchItadGame(
	env: Record<string, unknown>,
	appId: number
): Promise<{ id: string; slug?: string; boxart?: string } | null> {
	const apiKey = getEnv(env, "ITAD_API_KEY");
	if (!apiKey) return null;
	const url = new URL("https://api.isthereanydeal.com/games/lookup/v1");
	url.searchParams.set("key", apiKey);
	url.searchParams.set("appid", String(appId));
	let response: Response;
	try {
		response = await fetchWithTimeoutRetry(url.toString(), {}, { timeoutMs: 2000, retries: 1 });
	} catch {
		return null;
	}
	if (!response.ok) return null;
	const data = (await response.json()) as ItadLookupResponse;
	if (!data.found || !data.game?.id) return null;
	return { id: data.game.id, slug: data.game.slug, boxart: data.game.assets?.boxart };
}

export async function fetchItadPrices(
	env: Record<string, unknown>,
	gameId: string
): Promise<ItadPrices | null> {
	const apiKey = getEnv(env, "ITAD_API_KEY");
	if (!apiKey) return null;
	const url = new URL("https://api.isthereanydeal.com/games/prices/v3");
	url.searchParams.set("key", apiKey);
	url.searchParams.set("country", "US");
	let response: Response;
	try {
		response = await fetchWithTimeoutRetry(
			url.toString(),
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify([gameId])
			},
			{ timeoutMs: 2000, retries: 1 }
		);
	} catch {
		return null;
	}
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
	};
}

function getEnv(env: Record<string, unknown>, key: string) {
	const value = env[key];
	return typeof value === "string" && value.length > 0 ? value : null;
}
