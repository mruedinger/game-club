alter table polls add column history_valid integer check (history_valid in (0, 1));

update polls
set history_valid = case
	when status = 'closed' and (
		select count(distinct poll_votes.voter_email)
		from poll_votes
		where poll_votes.poll_id = polls.id
	) >= 3 then 1
	when status = 'closed' then 0
	else null
end;

create index if not exists idx_polls_history_valid_closed_at on polls(status, history_valid, closed_at);
