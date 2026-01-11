alter table games add column steam_app_id integer;
create index if not exists idx_games_steam_app_id on games(steam_app_id);
