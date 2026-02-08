type FetchRetryOptions = {
	timeoutMs?: number;
	retries?: number;
	backoffMs?: number;
	maxBackoffMs?: number;
	retryStatuses?: number[];
};

const DEFAULT_RETRY_STATUSES = [408, 429, 500, 502, 503, 504];

export async function fetchWithTimeoutRetry(
	input: RequestInfo | URL,
	init: RequestInit = {},
	options: FetchRetryOptions = {}
) {
	const timeoutMs = Math.max(1, options.timeoutMs ?? 2000);
	const retries = Math.max(0, options.retries ?? 1);
	const backoffMs = Math.max(0, options.backoffMs ?? 150);
	const maxBackoffMs = Math.max(backoffMs, options.maxBackoffMs ?? 1000);
	const retryStatuses = options.retryStatuses ?? DEFAULT_RETRY_STATUSES;

	for (let attempt = 0; attempt <= retries; attempt += 1) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetch(input, {
				...init,
				signal: controller.signal
			});
			if (attempt < retries && retryStatuses.includes(response.status)) {
				await sleep(backoffDelay(backoffMs, maxBackoffMs, attempt));
				continue;
			}
			return response;
		} catch (error) {
			if (attempt >= retries || !isRetryableError(error)) {
				throw error;
			}
			await sleep(backoffDelay(backoffMs, maxBackoffMs, attempt));
		} finally {
			clearTimeout(timeout);
		}
	}

	throw new Error("Request failed after retry attempts.");
}

function isRetryableError(error: unknown) {
	if (!(error instanceof Error)) return false;
	return error.name === "AbortError" || error instanceof TypeError;
}

function backoffDelay(base: number, cap: number, attempt: number) {
	const multiplier = 2 ** attempt;
	return Math.min(cap, base * multiplier);
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
