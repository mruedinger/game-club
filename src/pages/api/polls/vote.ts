import type { APIRoute } from "astro";
import { getRuntimeEnv, readSession } from "../../../lib/auth";

type D1Database = {
	prepare: (query: string) => {
		bind: (...args: unknown[]) => {
			all: <T>() => Promise<{ results: T[] }>;
			first: <T>() => Promise<T | null>;
			run: () => Promise<{ success: boolean }>;
		};
	};
};

export const prerender = false;

export const POST: APIRoute = async ({ locals, request }) => {
	const env = getRuntimeEnv(locals.runtime?.env);
	const session = await readSession(request, env);
	if (!session) {
		return new Response("Authentication required.", { status: 401 });
	}

	const db = getDb(env);
	if (!db) {
		return new Response("Polls database not configured.", { status: 500 });
	}

	const body = await readJson(request);
	const choices = normalizeChoices(body?.choices);
	if (!choices || choices.length === 0) {
		return new Response("At least one choice is required.", { status: 400 });
	}

	const activePoll = await db
		.prepare("select id from polls where status = 'active' limit 1")
		.bind()
		.first<{ id: number }>();
	if (!activePoll) {
		return new Response("No active poll.", { status: 404 });
	}

	const voterEmail = session.email.toLowerCase();
	const existingVote = await db
		.prepare("select id from poll_votes where poll_id = ?1 and voter_email = ?2")
		.bind(activePoll.id, voterEmail)
		.first<{ id: number }>();
	if (existingVote) {
		return new Response("Vote already submitted.", { status: 409 });
	}

	const allowed = await db
		.prepare("select game_id from poll_games where poll_id = ?1")
		.bind(activePoll.id)
		.all<{ game_id: number }>();
	const allowedSet = new Set(allowed.results.map((row) => row.game_id));

	for (const choice of choices) {
		if (!allowedSet.has(choice)) {
			return new Response("Invalid choice.", { status: 400 });
		}
	}

	const [choice1, choice2, choice3] = choices;
	await db
		.prepare(
			"insert into poll_votes (poll_id, voter_email, choice_1, choice_2, choice_3) values (?1, ?2, ?3, ?4, ?5)"
		)
		.bind(activePoll.id, voterEmail, choice1, choice2 ?? null, choice3 ?? null)
		.run();

	return new Response(null, { status: 204 });
};

function getDb(env: Record<string, unknown>): D1Database | undefined {
	const value = env.DB;
	if (value && typeof value === "object") {
		return value as D1Database;
	}
	return undefined;
}

async function readJson(request: Request): Promise<{ choices?: unknown } | null> {
	const text = await request.text();
	if (!text) return null;
	try {
		return JSON.parse(text) as { choices?: unknown };
	} catch {
		return null;
	}
}

function normalizeChoices(value: unknown): number[] | null {
	if (!Array.isArray(value)) return null;
	const result: number[] = [];
	for (const entry of value) {
		if (typeof entry === "number" && Number.isInteger(entry)) {
			result.push(entry);
		} else if (typeof entry === "string") {
			const parsed = Number.parseInt(entry, 10);
			if (!Number.isNaN(parsed)) {
				result.push(parsed);
			}
		}
	}
	const unique = Array.from(new Set(result)).slice(0, 3);
	if (unique.length !== result.length) {
		return null;
	}
	return unique;
}
