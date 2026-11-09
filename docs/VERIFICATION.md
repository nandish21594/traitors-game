# Verification record — 2026-11-06

## Automated checks

`node scripts/check.js`: syntax checks application, tests, scripts and vendored JavaScript modules.

`node --test --test-concurrency=1 tests/*.test.js`: **25 passing tests** covering transactional persistence, permanent identities, deliberate phone takeover, login throttling, concurrency and double votes, CSRF/auth boundaries, public/phone redaction, private revision side channels, rank/tie resolution with up to three Traitors, Shield fallback/blocking/expiry/gifts, score corrections, every-voter reveals, restricted revote and host tie-break, recruitment, finale, reviewed departures, safe undo, corrupt import rejection and fresh-database restore with media.

`node scripts/rehearsal.js`: **12 passing scenario checks with 14 simulated player sessions**, using actual HTTP calls and actual separate server processes. The scenario scores teams, retries a scoring request idempotently, uploads photo/image/PDF files, hides/reveals an answer, submits concurrent ballots, reveals all votes, handles murdered-Innocent Shield gifting and recruitment, pauses/restarts a ballot after departure, performs an administrative replacement, replaces a phone, kills/restarts the source process, transfers a JSON snapshot, imports it to a new destination database, verifies restored media bytes, and completes the Finale with a separate points champion. Public payloads are checked against player codes and hidden fields. Recruitment leaves the complete public payload, including its revision token, unchanged.

Reports and private portable snapshots are written to `test-output/rehearsal/<timestamp>/report.json` and `transfer/party.backup.json`. Do not publish that directory: it contains test login codes and roles. The report deliberately says `secondPhysicalMachineVerified: false`.

## Browser smoke checks

Performed in the local in-app Chromium browser:

- Password-protected host login and audited start confirmation.
- Private 14-player roster and offline QR render.
- Live +5 score award reflected on the projector.
- All **14 portrait cards fit at 1280×720 with document height 720**, without a vertical scrollbar during the round gallery.
- PDF upload through the host file chooser. A native PDF iframe stayed blank; this was fixed by replacing it with bundled PDF.js.
- PDF.js renders the two-page fixture as a canvas. Page 1 and page 2 were visually inspected; the second page showed “Round 1 - Second clue.”
- Phone login at **390×844**, with content width exactly 390 (no horizontal overflow), no role label, and correct identity.
- Phone murder ranking submits and shows “Decision sealed.” Reloading retains the locked ballot. No phone JavaScript errors were reported for this flow.

The browser viewport override was reset after responsive testing. Test fixtures are isolated from the default `data/` folder. The host is responsible for native fullscreen/browser behavior, visual legibility and actual slide-file compatibility on their projector device.

## Remaining physical checks

These have **not** been demonstrated in this environment:

- A second **physical** computer recovering from an off-device USB/network backup with the first laptop unavailable.
- Actual phone-to-laptop LAN access, router client isolation, firewall permissions and scanning the QR with a physical phone.
- Fourteen physical phones submitting in the room.
- The party projector, its resolution and the host’s extended-display setup.

The exact procedure and sign-off are in [REHEARSAL.md](REHEARSAL.md). Passing the software checks is not a substitute for those hardware/network checks.
