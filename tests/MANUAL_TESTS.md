# Manual Test Checklist

## Auth + Header
- Sign in with a whitelisted Google account.
- Confirm avatar shows in header and Sign Out button is visible.
- Open avatar modal, update alias, confirm change persists after refresh.
- Sign out; confirm you return to Home and header shows “Not signed in”.

## Admin: Members
- Open `/admin` as an admin.
- Members table renders and rows open the edit modal.
- Update role (non-self) and alias; verify changes persist.
- Add a new member; verify it appears in the table.
- Delete a member; verify it is removed.

## Admin: Games Editor
- Open `/admin` and click a game row.
- Edit submitter, status, tags, time-to-beat, played month; Save updates.
- Set a game to `current` and confirm previous current moves to `played`.

## Polls
- On Home: Start a poll and ensure voting UI appears.
- Vote with 3 ranked choices; confirm results appear for the user.
- Close the poll; confirm it becomes inactive and results remain visible.

## Games
- Add a game via the modal; verify duplicates are rejected.
- Confirm new submissions with Steam IDs populate MC Score in Backlog and can be sorted by the MC Score column.
- Open a game detail modal from the games table.
- Confirm game detail and current card metadata render in order: tags | ttb | metacritic score.
- Delete a game (as owner/admin) and confirm it disappears.
