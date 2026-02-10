alter table games add column poll_eligible integer check (poll_eligible in (0, 1));

update games
set poll_eligible = case
	when status = 'backlog' then 0
	else null
end;

create index if not exists idx_games_backlog_poll_eligible on games(status, poll_eligible);
