create table if not exists game_ratings (
	game_id integer not null,
	member_email text not null,
	rating integer not null check (rating between 1 and 5),
	created_at text not null default (datetime('now')),
	updated_at text not null default (datetime('now')),
	primary key (game_id, member_email),
	foreign key (game_id) references games(id) on delete cascade,
	foreign key (member_email) references members(email) on delete cascade
);

create index if not exists idx_game_ratings_game on game_ratings(game_id);
create index if not exists idx_game_ratings_member on game_ratings(member_email);
