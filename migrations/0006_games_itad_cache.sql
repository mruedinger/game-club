alter table games add column itad_game_id text;
alter table games add column price_checked_at text;
create index if not exists idx_games_price_checked_at on games(price_checked_at);
