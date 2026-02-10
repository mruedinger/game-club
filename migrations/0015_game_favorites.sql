create table if not exists game_favorites (
	game_id integer not null,
	member_email text not null,
	created_at text not null default (datetime('now')),
	primary key (game_id, member_email),
	foreign key (game_id) references games(id) on delete cascade,
	foreign key (member_email) references members(email) on delete cascade
);

create index if not exists idx_game_favorites_member on game_favorites(member_email);
