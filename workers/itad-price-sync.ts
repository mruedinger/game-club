import { fetchItadGame, fetchItadPrices } from "../src/lib/itad";

type Env = {
	DB: D1Database;
	ITAD_API_KEY?: string;
};

type D1Database = {
	prepare: (query: string) => {
		bind: (...args: unknown[]) => {
			all: <T>() => Promise<{ results: T[] }>;
			run: () => Promise<{ success: boolean }>;
		};
	};
};

type GameRow = {
	id: number;
	steam_app_id: number | null;
	itad_game_id?: string | null;
	itad_slug?: string | null;
	price_checked_at?: string | null;
};

export default {
	async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(runPriceSync(env));
	}
};

async function runPriceSync(env: Env) {
	const db = env.DB;
	const { results } = await db
		.prepare(
			"select id, steam_app_id, itad_game_id, itad_slug, price_checked_at from games " +
				"where steam_app_id is not null and (price_checked_at is null or datetime(price_checked_at) < datetime('now', '-1 day'))"
		)
		.bind()
		.all<GameRow>();

	for (const game of results) {
		if (!game.steam_app_id) continue;
		const itadGame =
			game.itad_game_id
				? { id: game.itad_game_id, slug: game.itad_slug ?? undefined }
				: await fetchItadGame(env, game.steam_app_id);
		if (!itadGame?.id) continue;
		const prices = await fetchItadPrices(env, itadGame.id);
		if (!prices) continue;
		await db
			.prepare(
				"update games set itad_game_id = ?1, itad_slug = ?2, current_price_cents = ?3, best_price_cents = ?4, price_checked_at = datetime('now') where id = ?5"
			)
			.bind(
				itadGame.id,
				itadGame.slug ?? null,
				prices.currentPriceCents,
				prices.bestPriceCents,
				game.id
			)
			.run();
	}
}
