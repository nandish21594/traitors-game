# Rules for the host

## Before the gathering

Default two Traitors, one Shield per round, Finale at four active players. Intended size: 10–14 plus a separate host; the engine permits 3–30 for rehearsal and host-managed formats. Configure roles in the private roster. If none are assigned when starting, the server uses its persisted random seed to choose the configured count. If some are manually assigned, their count must match settings.

Everyone receives a folded initial role card. Traitors know one another. Phones never show roles, teammate lists, recruitment notices, or a role-specific task. All active participants see the same ballot structure and response pattern. Give everyone the same card interaction during every round interlude so paper distribution does not identify a recruit.

## Numbered rounds

Offline mini-game → enter points → allocate Shields → common murder prediction ballot → Ring of Doubt discussion → private banishment ballot → reveal **every** vote one at a time and ask each voter why → banish and reveal role → private murder preview and public announcement → common card interlude / possible Recruitment → next round.

At/below the configured Finale threshold after a banishment, enter the Finale immediately and skip the pending murder. At/below it after a murder, enter the Finale after the announcement without Recruitment. If no active Traitor remains after banishment, Innocents win immediately. The host may enter the Finale early between completed ballots with an audited reason.

## Murder ranking

- Every active player ranks **0–5 distinct active other players**. Traitors and Innocents see the same candidates, including other Traitors and Shield holders. No role is inferred from candidate filtering. Innocents' rankings are predictions only.
- On resolution, only **currently active Traitors'** rankings count. A Traitor banished or marked Left Party in the interim no longer contributes.
- Each active non-Traitor target receives the sum of its rank in each contributing ranking (1–5). An unranked target receives **6** for that voter. This works with one, two, three or more configured Traitors. With one Traitor, ranked choices keep their order; all unranked choices follow with a stable seeded order. Even empty rankings can produce a seeded fallback target; the host reviews exceptional cases before announcement.
- Lowest sum wins; ties use the lexical SHA-256 of `saved seed : round number : player ID`. The seed and aggregates stay server-side. Banishment/departure removes unavailable candidates; Shield holders are skipped in favor of the next eligible aggregate target.
- If every otherwise eligible candidate is Shield-protected, murder is blocked; no elimination is forced. The host can also record a direct attempted target: that target's Shield blocks the attempt, without redirecting it. An explicit no-murder override is supported. Overrides need reasons; an override invalidated by departure/role correction must be reviewed before announcement.
- A Shield prevents murder, never banishment. It is current-round protection and expires at the next round; a blocking Shield is consumed.

## Shield scoring and gifts

The highest eligible **current-round** scorer wins a Shield. Eligibility: active players of either role, or previously murdered Innocents. Banished, retired and permanently departed players cannot win or gift, even under the manual assignment workflow.

An active winner receives their own Shield. A murdered Innocent gives a folded gift decision to the host naming any active recipient. They never receive an app ballot and must sit out role discussion. Score ties need an offline tie-break and recorded reason. With multiple configured Shields, award descending eligible scorers, one standard award per winner; tied cutoffs require host resolution. Special games can use reasoned manual assignments. Current-round Shields can be corrected while paused before murder announcement; historical rounds are not automatically recalculated.

Public ownership is the default. Hidden ownership is configurable: points remain public; protection stays out of public and phone payloads until a relevant blocked-murder reveal. Public scores may still suggest who won protection.

## Banishment

One vote per active player for another eligible candidate, locked on submission. The host may reset open, unrevealed submissions with a reason. Closing freezes the ballot. Missing ballots can be explicitly recorded as abstentions, each still included in public reveals. Reconnect or replacement does not create an extra vote.

Reveal all voters, including Traitors, one by one. Ask “What led you to that decision?” after each reveal. Only then resolve the highest vote count. A tie opens one new ballot restricted to tied active targets; all active players vote, including tied players, and nobody votes for themselves. Reveal all runoff votes as well. A persistent tie requires an offline host tie-break and a recorded choice/reason. No silent random banishment.

## Departure review

Connectivity is informational. Losing Wi-Fi never changes status. For an explicit departure/retirement/restore, the host pauses and records a reason, then chooses:

- **Cancel:** no status change; return to the prior pause state.
- **Retain decisions:** preserve submitted votes, including a departing voter's submission. Remove absent unsubmitted voters from the open electorate and unavailable candidates from future choices. A retained vote for a departed target is revealed but excluded from elimination tally. Murder rankings only use active Traitors. If all votes are invalid/abstentions, revote among remaining candidates.
- **Restart open ballot:** archive it as superseded, create a new ballot for active players, and clear submissions in the new ballot. This is unavailable after closure or any reveal.

Already closed/revealed ballots and finished past rounds are unchanged. Status affects current outcome eligibility. The game remains paused after applying a departure: review Shield recipients, role balance, and pending overrides before resuming. A restored player does not join an already frozen electorate; restart an open ballot explicitly if needed. Restore uses their previous status where present, so returning from Left Party does not revive a previously murdered player. Restoring an erroneously eliminated player is a deliberate public correction; prior role knowledge cannot be undone.

A departed Traitor may receive one audited administrative replacement from an active Innocent while paused. This is distinct from normal Recruitment. Finish/reset an open ballot before a mid-ballot role edit. If the host proceeds with zero active Traitors, Innocents win; the pause provides the opportunity to decide replacement first.

## Normal Recruitment

Once per game, after a Traitor banishment outside the Finale, if at least one Traitor survives. It happens at the common card interlude after murder announcement; a recruit must still be an active Innocent. The host records the surviving Traitor's paper decision and confirms discreet distribution to everyone. No phone or projector payload (including its public revision token) changes because of the secret role change alone. Declining/skipping an opportunity does not consume it. No Recruitment during the Finale.

## Finale

Murders stop. Every active participant chooses **TRUST** or **TRAITOR** in private. Unanimous TRUST ends the game. Any TRAITOR (or an explicit abstention) opens a banishment cycle, with full banishment vote reveals and the eliminated player's role, then another trust decision. Two remaining players end the Finale automatically after the current banishment. No Traitor remaining means an immediate Innocents win. Otherwise, at final TRUST/two players, Traitors win if any survive. All current roles are revealed at the end.

## Two independent results

Faction victory follows the Traitors rules. The offline high scorer follows the sum of all recorded round totals, regardless of elimination. Tied high scorers share that result. Group awards apply the entered points to **each** selected player; set replaces the selected round's totals. Corrections always carry an audit reason.
