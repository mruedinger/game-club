const HLTB_SEARCH_URL = "https://howlongtobeat.com/search_results";
const HLTB_BASE_URL = "https://howlongtobeat.com";

export async function fetchHltbTimeMinutes(title: string, timeoutMs = 4000): Promise<number | null> {
	if (!title) return null;
	const searchHtml = await fetchWithTimeout(buildSearchRequest(title), timeoutMs);
	if (!searchHtml) return null;
	const gamePath = extractGamePath(searchHtml, title);
	if (!gamePath) return null;

	const gameHtml = await fetchWithTimeout(new Request(`${HLTB_BASE_URL}${gamePath}`), timeoutMs);
	if (!gameHtml) return null;

	const rawTime = extractHowLongToBeatTime(gameHtml);
	if (!rawTime) return null;
	return parseDurationToMinutes(rawTime);
}

function buildSearchRequest(title: string) {
	const body = new URLSearchParams({
		query: title,
		page: "1"
	});
	return new Request(HLTB_SEARCH_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded"
		},
		body: body.toString()
	});
}

async function fetchWithTimeout(request: Request, timeoutMs: number) {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(request, { signal: controller.signal });
		if (!response.ok) return null;
		return await response.text();
	} catch {
		return null;
	} finally {
		clearTimeout(timeoutId);
	}
}

function extractGamePath(html: string, title: string) {
	const normalizedTitle = normalizeTitle(title);
	const results = extractSearchResults(html);
	if (results.length === 0) return null;

	const exactMatch = results.find((result) => normalizeTitle(result.title) === normalizedTitle);
	if (exactMatch) return exactMatch.path;

	return results[0].path;
}

function extractSearchResults(html: string) {
	const results: { title: string; path: string }[] = [];
	const blockRegex = /<a[^>]+href="(\/game\/[^"]+)"[^>]*>(.*?)<\/a>/gi;
	let match: RegExpExecArray | null;
	while ((match = blockRegex.exec(html))) {
		const path = match[1];
		const title = stripTags(match[2]);
		if (path && title) {
			results.push({ title, path });
		}
	}
	return results;
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

function stripTags(value: string) {
	return decodeHtml(value.replace(/<[^>]*>/g, "")).trim();
}

function decodeHtml(value: string) {
	return value
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, "\"")
		.replace(/&#39;/g, "'")
		.replace(/&frac12;/g, ".5");
}
