create table if not exists games (
	id integer primary key autoincrement,
	title text not null,
	submitted_by_email text not null,
	status text not null check (status in ('backlog', 'current', 'played')) default 'backlog',
	created_at text not null default (datetime('now')),
	cover_art_url text,
	tags_json text,
	description text,
	time_to_beat_minutes integer,
	current_price_cents integer,
	best_price_cents integer,
	played_month text,
	foreign key (submitted_by_email) references members(email)
);

create index if not exists idx_games_status on games(status);
create index if not exists idx_games_played_month on games(played_month);
