alter table games add column metacritic_score integer check (metacritic_score between 0 and 100);
