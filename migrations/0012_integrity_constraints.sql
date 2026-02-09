create unique index if not exists idx_games_single_current
	on games(status)
	where status = 'current';

create unique index if not exists idx_polls_single_active
	on polls(status)
	where status = 'active';

create unique index if not exists idx_games_steam_app_id_unique
	on games(steam_app_id)
	where steam_app_id is not null;

create unique index if not exists idx_games_title_normalized_unique
	on games(lower(title));
