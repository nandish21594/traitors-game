# Physical-device rehearsal and backup sign-off

The software rehearsal is automated. **The following physical checks have not been performed by Codex**: this workspace provides one laptop, without access to a second computer/USB device, 14 physical phones, or the party projector/router. Complete these before relying on the app for the event.

## Source laptop and actual network

- [ ] Node 24 installed; private host password recorded; laptop plugged in and sleep disabled.
- [ ] Actual Wi-Fi IP selected; `JOIN_URL` matches the laptop and port.
- [ ] A real phone scans the public QR, opens `/join`, and signs in with its assigned code.
- [ ] Windows Private firewall allows the chosen TCP port; guest/client isolation does not block the phone.
- [ ] Browser restart retains the player. A replacement phone uses the same code, confirms takeover, invalidates the former session, and keeps role/status/points.
- [ ] An eliminated player's replacement phone remains eliminated; a temporary disconnection never marks someone Left Party.
- [ ] Ideally all 14 phones submit both ballot types in the room; no role-specific screen, notification, timing rule or candidate filter appears.

## Actual projector

- [ ] Extend displays; only `/projector` is on the public screen. Host roster and password window stay private.
- [ ] Portraits and round/overall leaderboards are readable from the back of the room at the projector's resolution.
- [ ] Every banishment vote reveals once with a pause for the host to ask for reasoning; role reveal, murder/blocked murder and Finale display correctly.
- [ ] Uploaded movie-clue PDF page 1/2 changes correctly in the actual browser; images fill the screen; hidden answer field stays hidden until reveal.
- [ ] Native browser fullscreen works. Separate PDF/PPT window is ready as a fallback. Files are available without internet.

## Off-device recovery — required hardware-failure rehearsal

1. [ ] Create a test round with scores, a portrait, a PDF, a Shield and a partially completed ballot.
2. [ ] Export a snapshot and **physically copy it** to USB, a second device or a network share. Verify its bytes/file exist there. Record path/device: __________________.
3. [ ] On a different physical computer, install Node 24 and copy the application source/vendor files.
4. [ ] Disconnect/stop the original laptop. Start the application with a new empty `DATA_DIR` on the second computer.
5. [ ] Import the off-device snapshot from that device; confirm the imported game is paused.
6. [ ] Compare permanent IDs, player status, private roles, round/overall scores, submitted ballots, reveal position, Shield assignments, photo and PDF. Source audit history appears in the restore event.
7. [ ] Point the common QR to the new computer's LAN address, rejoin actual phones with original codes, resume, and finish a round. Eliminated players remain ineligible.
8. [ ] Export from the second computer back to the backup device. Decide who copies snapshots after every real round.

Device/OS: __________________   Date: __________________   Host sign-off: __________________

Do not mark the physical recovery requirement complete merely because `scripts/rehearsal.js` passed: its two processes and databases run on one physical laptop.
