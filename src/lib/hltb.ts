const HLTB_SEARCH_URL = "https://howlongtobeat.com/api/search";
const HLTB_BASE_URL = "https://howlongtobeat.com";
const HLTB_HEADERS = {
	"User-Agent": "Mozilla/5.0 (compatible; GameClubBot/1.0)",
	"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
	"Accept-Language": "en-US,en;q=0.9",
	"Referer": "https://howlongtobeat.com/",
	"Origin": "https://howlongtobeat.com"
};

export async function fetchHltbTimeMinutes(title: string, timeoutMs = 4000): Promise<number | null> {
	if (!title) return null;
	console.log(`[HLTB] search: "${title}"`);
	const searchJson = await fetchJsonWithTimeout(buildSearchRequest(title), timeoutMs, "search");
	if (!searchJson) {
		console.warn("[HLTB] search failed");
		return null;
	}
	const gamePath = extractGamePath(searchJson, title);
	if (!gamePath) {
		console.warn("[HLTB] no match found");
		return null;
	}

	console.log(`[HLTB] match: ${gamePath}`);
	const gameHtml = await fetchWithTimeout(
		new Request(`${HLTB_BASE_URL}${gamePath}`, { headers: HLTB_HEADERS }),
		timeoutMs,
		"detail"
	);
	if (!gameHtml) {
		console.warn("[HLTB] game page fetch failed");
		return null;
	}

	const rawTime = extractHowLongToBeatTime(gameHtml);
	if (!rawTime) {
		console.warn("[HLTB] HowLongToBeat value not found");
		return null;
	}
	const minutes = parseDurationToMinutes(rawTime);
	if (!minutes) {
		console.warn(`[HLTB] parse failed: "${rawTime}"`);
		return null;
	}
	console.log(`[HLTB] parsed ${minutes} minutes`);
	return minutes;
}

function buildSearchRequest(title: string) {
	const body = {
		searchType: "games",
		searchTerms: title.split(" "),
		searchPage: 1,
		size: 20,
		searchOptions: {
			games: {
				userId: 0,
				platform: "",
				sortCategory: "popular",
				rangeCategory: "main",
				rangeTime: { min: 0, max: 0 },
				gameplay: { perspective: "", flow: "", genre: "" },
				rangeYear: { min: 0, max: 0 },
				modifier: ""
			},
			users: { sortCategory: "postcount" },
			lists: { sortCategory: "follows" },
			filter: "",
			sort: 0,
			randomizer: 0
		}
	};
	return new Request(HLTB_SEARCH_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...HLTB_HEADERS
		},
		body: JSON.stringify(body)
	});
}

async function fetchWithTimeout(request: Request, timeoutMs: number, label: string) {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(request, { signal: controller.signal });
		if (!response.ok) {
			console.warn(`[HLTB] ${label} status ${response.status}`);
			return null;
		}
		return await response.text();
	} catch {
		return null;
	} finally {
		clearTimeout(timeoutId);
	}
}

async function fetchJsonWithTimeout(request: Request, timeoutMs: number, label: string) {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(request, { signal: controller.signal });
		if (!response.ok) {
			console.warn(`[HLTB] ${label} status ${response.status}`);
			return null;
		}
		return await response.json();
	} catch {
		return null;
	} finally {
		clearTimeout(timeoutId);
	}
}

function extractGamePath(payload: unknown, title: string) {
	if (!payload || typeof payload !== "object") return null;
	const data = (payload as { data?: Array<{ game_name?: string; game_id?: number; game_slug?: string }> }).data;
	if (!Array.isArray(data) || data.length === 0) return null;

	const normalizedTitle = normalizeTitle(title);
	const exact = data.find((entry) => normalizeTitle(entry.game_name || "") === normalizedTitle);
	const best = exact || data[0];
	if (!best?.game_id || !best?.game_slug) return null;
	return `/game/${best.game_id}/${best.game_slug}`;
}

function extractHowLongToBeatTime(html: string) {
	const match = html.match(/<h4>\s*HowLongToBeat\s*<\/h4>\s*<h5>\s*([^<]+)\s*<\/h5>/i);
	if (!match) return null;
	return decodeHtml(match[1].trim());
}

function parseDurationToMinutes(value: string): number | null {
	const text = decodeHtml(value)
		.replace(/½/g, ".5")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();

	const hoursMatch = text.match(/(\d+(?:\.\d+)?)\s*hours?/);
	const minsMatch = text.match(/(\d+(?:\.\d+)?)\s*mins?/);
	const hours = hoursMatch ? Number.parseFloat(hoursMatch[1]) : 0;
	const mins = minsMatch ? Number.parseFloat(minsMatch[1]) : 0;
	const total = Math.round(hours * 60 + mins);
	return Number.isFinite(total) && total > 0 ? total : null;
}

function normalizeTitle(value: string) {
	return value
		.toLowerCase()
		.replace(/&amp;/g, "&")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function decodeHtml(value: string) {
	return value
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, "\"")
		.replace(/&#39;/g, "'")
		.replace(/&frac12;/g, ".5");
}
