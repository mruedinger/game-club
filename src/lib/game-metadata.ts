import { fetchWithTimeoutRetry } from "./http";
import { fetchIgdbTimeMinutes } from "./igdb";
import { fetchItadGame, fetchItadPrices } from "./itad";

type SteamGenre = { description: string };
type SteamAppDetails = {
	name?: string;
	header_image?: string;
	short_description?: string;
	genres?: SteamGenre[];
};

type SteamReviewsResponse = {
	query_summary?: {
		review_score?: number | string;
		review_score_desc?: string;
	};
};

export type ExternalGameMetadata = {
	title: string | null;
	coverArtUrl: string | null;
	description: string | null;
	tagsJson: string | null;
	timeToBeatMinutes: number | null;
	steamReviewScore: number | null;
	steamReviewDesc: string | null;
	itadGameId: string | null;
	itadSlug: string | null;
	itadBoxartUrl: string | null;
	currentPriceCents: number | null;
	bestPriceCents: number | null;
	hasPriceData: boolean;
};

export async function fetchExternalGameMetadata(
	env: Record<string, unknown>,
	titleHint: string,
	steamAppId: number
): Promise<ExternalGameMetadata> {
	const steamDetailsPromise = fetchSteamDetails(steamAppId);
	const steamReviewsPromise = fetchSteamReviewSummary(steamAppId);
	const itadGamePromise = fetchItadGame(env, steamAppId);
	const ttbPromise = fetchIgdbTimeMinutes(env, titleHint, steamAppId);
	const itadPricesPromise = itadGamePromise.then((itadGame) =>
		itadGame?.id ? fetchItadPrices(env, itadGame.id) : null
	);

	const [steamDetails, steamReviews, itadGame, ttbMinutes, itadPrices] = await Promise.all([
		steamDetailsPromise,
		steamReviewsPromise,
		itadGamePromise,
		ttbPromise,
		itadPricesPromise
	]);

	return {
		title: steamDetails?.name ?? null,
		coverArtUrl: steamDetails?.header_image ?? null,
		description: steamDetails?.short_description ?? null,
		tagsJson:
			steamDetails?.genres && steamDetails.genres.length > 0
				? JSON.stringify(steamDetails.genres.map((genre) => genre.description))
				: null,
		timeToBeatMinutes: ttbMinutes,
		steamReviewScore: steamReviews.score,
		steamReviewDesc: steamReviews.desc,
		itadGameId: itadGame?.id ?? null,
		itadSlug: itadGame?.slug ?? null,
		itadBoxartUrl: itadGame?.boxart ?? null,
		currentPriceCents: itadPrices?.currentPriceCents ?? null,
		bestPriceCents: itadPrices?.bestPriceCents ?? null,
		hasPriceData: Boolean(itadPrices)
	};
}

async function fetchSteamDetails(appId: number): Promise<SteamAppDetails | null> {
	let response: Response;
	try {
		response = await fetchWithTimeoutRetry(
			`https://store.steampowered.com/api/appdetails?appids=${appId}&cc=us&l=en`,
			{},
			{ timeoutMs: 2000, retries: 1 }
		);
	} catch {
		return null;
	}
	if (!response.ok) return null;
	const payload = (await response.json()) as Record<
		string,
		{ success: boolean; data?: SteamAppDetails }
	>;
	const entry = payload[String(appId)];
	if (!entry || !entry.success || !entry.data) return null;
	return entry.data;
}

async function fetchSteamReviewSummary(
	appId: number
): Promise<{ score: number | null; desc: string | null }> {
	let response: Response;
	try {
		response = await fetchWithTimeoutRetry(
			`https://store.steampowered.com/appreviews/${appId}?json=1&language=english&purchase_type=steam&num_per_page=0`,
			{},
			{ timeoutMs: 2000, retries: 1 }
		);
	} catch {
		return { score: null, desc: null };
	}
	if (!response.ok) return { score: null, desc: null };
	const payload = (await response.json()) as SteamReviewsResponse;
	return {
		score: normalizeSteamReviewScore(payload?.query_summary?.review_score),
		desc: normalizeSteamReviewDesc(payload?.query_summary?.review_score_desc)
	};
}

function normalizeSteamReviewScore(value: unknown): number | null {
	const parsed =
		typeof value === "number"
			? Math.trunc(value)
			: typeof value === "string"
				? Number.parseInt(value, 10)
				: Number.NaN;
	if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return null;
	if (parsed < 0 || parsed > 9) return null;
	return parsed;
}

function normalizeSteamReviewDesc(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const text = value.trim();
	return text ? text : null;
}
