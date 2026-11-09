# Traitors Game Specification

**Status:** Product requirements. See [IMPLEMENTATION.md](IMPLEMENTATION.md) for the build and [VERIFICATION.md](VERIFICATION.md) for test coverage.

## Objective
Build a reliable, self-hosted, LAN-accessible party game for **10–14 players plus a host**, played over **3–4 hours** in a small living room. The application manages player identity, game state, roles, shields, scoring, voting, eliminations, recruitment, dramatic projector reveals and host intervention. Real-world mini-games occur primarily **offline**. Use a social deduction theme and consistent game terms: **Traitors, Innocents, Murder, Shield, Ring of Doubt, Recruitment, Finale**. Use numbered rounds, not “night/tonight.”

Reference/inspiration: https://github.com/trevornogues/traitors-game/tree/main — inspect code and licensing before reusing anything. You may build afresh if cleaner.

## Three interfaces
1. **Public projector:** A dramatic, readable layout, player portrait gallery, current game phase, round and overall transparent scoreboards, timer, vote-by-vote banishment reveals, murders, eliminated-status graphics, finale and optional built-in PDF/image presentation viewer. This is read-only and NEVER shows unrevealed roles, hidden murder votes, PINs or host controls.
2. **Private player phone:** QR code opens one common join URL; player enters their assigned code, uploads selfie/existing photo (avatar fallback), and later performs only necessary private decisions. Every role sees an identical-looking normal interface and identical ballot structure, so observing phone activity cannot reveal a Traitor. Avoid role labels, role-specific notifications and conspicuous chat windows. Initial roles can be distributed with sealed paper. A physically observed private paper/card can still compromise secrecy; UX should minimize that risk.
3. **Host control:** Password-protected control panel (not mirrored to projector). Register and map players to permanent IDs and unique **6-digit recommended** codes, regenerate lost code, manage roles, advance/pause/undo phases, edit points, award Shields, handle absences/departures, review private votes, resolve ties, recruit a replacement Traitor, trigger projector reveals, export/import backups, recover interrupted games, view audit history. No accidental public leakage.

## Identity and resilience
- Permanent server-side player ID; login code only authenticates that same record. Rejoining must NEVER create a fresh player or restore eliminated player as active. Single current phone session per player, with controlled session invalidation; rate-limit code attempts. Names are display-only, not identity keys.
- Persistent database (e.g. SQLite), with every state change committed transactionally, audit/event history, recovery on server restart, safe prevention of duplicate voting, and host-controlled restore/undo.
- A laptop hardware failure cannot be recovered from a backup stored only on that laptop. Provide easily exported restore snapshots and a documented **second-device/USB/network backup** process. Optional automated off-device backup; demonstrate actual restoration on a second machine.
- Phones and host must communicate via same Wi-Fi/LAN. Include instructions for network isolation, firewall/port, QR address and HTTPS/camera restrictions. Prefer photo file upload with camera capture as optional. Be transparent that an HTTP LAN origin may restrict in-browser camera APIs.
- Never treat ordinary disconnection as quitting; host can explicitly mark a player as **Left Party** and optionally restore after review. Host can rebalance formats/roles and safely resume without corrupting votes or history.

## Core party game
- Default **2 Traitors** and all remaining players Innocents for 10–14 players; host can configure roles before beginning. Secret initial roles supplied by host on folded paper; Traitors know one another. The application stores identities privately. When a Traitor is banished before the finale, surviving Traitor may secretly recruit **one Innocent once per game**; host performs discreet paper-card distribution so all players appear to take the same action. If both Traitors are eliminated with none surviving, Innocents win immediately. If a Traitor voluntarily leaves, allow an audited host-managed administrative replacement distinct from normal recruitment.
- Each numbered round: offline mini-game → point entry → Shield allocation → murder prediction/selection ballot → Ring of Doubt discussion → private banishment ballot → **public reveal of EVERY player's banishment vote**, one by one, host asks for reasoning → banished player's role revealed → murder announcement (or blocked murder) → possible recruitment → next round.
- **Murder ballot privacy:** Everyone receives the same-looking screen and ranks **up to five eligible active other players** for “Predict Round N's Murder.” Innocents' submissions are just predictions. Only active Traitors' rankings determine a murder. Proposed deterministic calculation: for each eligible non-Traitor target, sum each active Traitor's rank, giving unranked candidates a penalty (e.g. rank 6); take lowest total, apply consistent seeded tie-break. Reject targets with a Shield, or targets removed by the intervening banishment, and use next eligible ranking. If one Traitor remains, use their ranked order. The host can preview/override exceptional cases with audit. Ensure actual target/algorithm remains secret.
- **Ring of Doubt:** All active players submit one banishment vote privately, after public discussion. Reveal ALL votes on projector, not only Innocents' votes (which would expose Traitors). Host questions each voter. Most votes gets banished and reveals role. Decide/run a documented tied-vote revote rule. Votes immutable after reveal; reconnect cannot vote twice. Banishment can affect murder eligibility. Do not force an elimination when a Shield blocks murder; next mini-game adapts to actual player count.
- **Finale:** With roughly four active players (configurable), stop murders. Everyone chooses TRUST or TRAITOR. If unanimous TRUST, reveal remaining roles and determine winner. If any TRAITOR, everyone secretly votes one person out, reveal role and repeat until unanimous TRUST or two remain. Innocents win if zero Traitors at game end, otherwise Traitors win. Do not recruit during finale.

## Mini-games, points, shields
- App must NOT mandate a particular mini-game or number of groups. Host selects/enters a free-text mini-game title and can score individual, pair, arbitrary-sized group, or two teams; also manual override for games like Shield Swap. Offline UNO, movie guessing, music/BGM/dialogue guesses and paper games are examples, not app dependencies.
- Host can add scores live (+1/+5/+10 shortcuts, direct numeric edit, bulk group/team award) OR enter final round totals later after pen-and-paper tallying. Show editable **round points** and calculated **overall totals**; visible publicly to everyone. Audit corrections and avoid double-counting after edits.
- **Default Shield:** Highest eligible current-round scorer wins one Shield. If active, they receive it. If a **previously murdered Innocent** wins, that player may gift Shield to any active participant. Banished players cannot gift. If tie, host performs tie-break or records override; configurable multiple Shields and manual assignment for special games. The Shield prevents murder once for the current round, not banishment. A player who left permanently cannot win Shield. Murdered Innocents may keep playing offline mini-games for overall points, but cannot discuss roles, vote, or choose murder victims.
- Maintain two independent results: winning faction of Traitors game vs overall high scorer of offline games.

## Hybrid presentation
- Support host upload/display of **PDF slides or images** in a lightweight projector presentation viewer, preferably with next/previous, fullscreen, timer and answer-reveal states. Slides can be authored separately in PowerPoint and exported to PDF. Do NOT implement a slide editor. Keep movie clues accessible offline. A separate PPT/PDF window must remain a fallback.

## Host contingencies and controls
- Host can pause/resume safely at any stage; mark a player as temporarily disconnected vs permanently left; manually retire player, correct Shield and scores, edit role with confirmation, resubmit or close a ballot safely, audit host changes, reassign teams/group sizes, and optionally restore an erroneously retired player without duplicating identity.
- Departures may affect votes already cast, murder ranking, shields or recruitment. Make a clear host-reviewed resolution workflow and record decisions. Do not silently change finished past rounds. Design rollback as an event/state correction not destructive deletion of history.

## Suggested implementation order (Codex should plan and test phase by phase)
1. Repository setup, local server and persistence, player identity/rejoin, admin authentication, distinct projector vs private routes, fake profiles for testing.
2. State machine and rules, ballots, ranking/ties, live updates, shield/recruitment/departure, complete automated rule tests.
3. Host score manager (including murdered Innocents), overall leaderboard, presentation viewer and projector experience.
4. Interface polish, QR join, import/export/restore on different machine, network access guide, adversarial privacy/reconnection tests, end-to-end rehearsal with 14 simulated players.

## Acceptance criteria and tests
- Same player code rejoins after browser restart or phone replacement with same role/status/history; wrong codes are rate-limited; a duplicate session is handled deliberately.
- With 10–14 simulated users, all can submit identical-looking murder ranking ballots; only Traitor votes affect murder; tie and overlap cases resolve correctly; no client payload publicly exposes hidden roles.
- Public reveal includes ALL banishment voters and reasons are prompted to host; no double votes or post-reveal mutation.
- Shield blocks attempted murder; if top target is unavailable, choose next valid candidate; current-round and overall scores remain mathematically correct after edits, group awards and restarts.
- A murdered Innocent tops round scoring, gifts Shield to a remaining player, and cannot participate in banishment/murder.
- Recruitment can occur discreetly once after a Traitor banishment; role changes reflected in subsequent rounds without exposing them on projector/phone.
- Player departures/disconnects and emergency host intervention do not corrupt game, including during an in-progress ballot.
- Full restart on same computer recovers exact state; a **new machine** can import an off-device backup and recover game. The restore process is documented and rehearsed.
- Projector can show the gallery, leaderboard, voting reveal, PDF movie clues, and finale without ever exposing private admin/roles.

## Open product decisions — confirm before final implementation
- Should the active highest scorer's Shield recipient be public (implied by public leaderboard) or privately declared? We can keep scoring public and ownership hidden until murder reveal if useful.
- How exactly to handle unranked targets, ties, shields and murder choice when there are three active Traitors if configuration changes.
- Tie-break in banishment and how to treat a departure mid-ballot.
- How to handle a deceased winner's Shield gift (paper to host preferred, to avoid phone-role activity).
- One or two Shields by default per round, configurable in host dashboard.
