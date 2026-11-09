# Implementation record

## Architecture

One Node.js 24 LTS process serves a buildless browser application and JSON APIs on the LAN. SQLite (Node's built-in `node:sqlite`, no external database service) stores the current game, immutable audit events with correction snapshots, authentication, and media. State changes run inside `BEGIN IMMEDIATE` transactions. The pure rules engine is independent of HTTP, identity, and display code.

Three entry points: `/projector` (public allowlisted data), `/join` (one current cookie session per permanent player), and `/host` (separate password session and private APIs). Browser requests poll every two seconds. Ballot submissions use frozen electorates and a unique player key; state mutations use revision checks and idempotency keys. No phone receives a role, including its own; paper handles roles and recruitment.

The reference repository's README, `server.js`, `game.js`, and package manifest were inspected on 2026-11-06. It uses Express/Socket.IO and in-memory game objects tied to socket identities. No reuse license was verified in its root listing. This application contains no code copied from that repository.

## Phases and gates

1. **Foundation:** native HTTP server, SQLite transactions, audit, permanent identities, six-digit codes, session takeover, login throttling, private/public boundaries, demo roster. Gate: authentication, rejoin, restart, and public-payload tests.
2. **Rules:** numbered rounds, immutable ballots, ranked murder, complete vote reveals, revote, Shields, recruitment, finale, reviewed departures, pause and correction. Gate: deterministic automated rule and adversarial tests.
3. **Party experience:** score ledger and groups, round/overall leaderboards, host controls, projector, image/PDF presentation, timer. Gate: score correction/restart and media/presentation tests.
4. **Rehearsal:** Interface polish, local QR, recovery/import/export, LAN guide, privacy and reconnect checks, 14-player HTTP rehearsal, browser smoke tests. Gate: actual process restart and fresh-database import, plus documented second-physical-device limitation if no second device is available.

## Proposed rule defaults

The open decisions were presented during implementation. With no changes supplied, the implementation uses the proposed defaults: one public Shield; unranked murder penalty 6; deterministic SHA-256 seeded ties for any configured number of Traitors; one tied-candidate revote followed by a recorded host decision; open departures pause for review; murdered Innocents gift through paper to the host. Configurable choices appear in host settings; exact rules are documented in RULES.md.

## Verification record

All four software phases are implemented. See VERIFICATION.md for 25 automated tests, the 14-session HTTP rehearsal and browser smoke checks. Public/phone refresh tokens hash only their allowlisted view, so a private role update or another voter's submission cannot be inferred from the host's internal revision counter. PDF.js was bundled after a native PDF frame failed browser QA; page 1 and page 2 now render in a canvas offline.

The second physical machine, actual phone Wi-Fi and projector checks remain explicitly pending in REHEARSAL.md. A fresh process/database on this laptop is not a second physical machine. The project is not claimed fully party-rehearsed until those physical checks are signed off.
