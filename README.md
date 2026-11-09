# Traitors

A social deduction party game for **10–14 players and a host**. Play mini-games together, then use your phones to make private decisions. **Innocents** try to banish every Traitor. **Traitors** try to survive the final vote. Mini-game points crown a separate champion, no matter which side wins.

[Start locally](#start-locally) · [Follow a full game](#screenshots) · [Host guide](docs/HOST-GUIDE.md) · [Full rules](docs/RULES.md)

![Traitors home page with links to join, open the projector, and enter host control](docs/screenshots/desktop-home.png)

## Start locally

Install **Node.js 24 LTS** and run this from the project directory. No package install or build step is needed.

```powershell
node server.js
```

1. Open the [host desk](http://localhost:3000/host) on your laptop and sign in with the first-run password printed in the terminal.
2. Open the [projector](http://localhost:3000/projector) on a separate display. Use an extended display so your private host desk stays off the big screen.
3. Put every device on the same trusted Wi-Fi. From a phone, test the server's printed **LAN join** address before the game. A phone needs the laptop's Wi-Fi address, since `localhost` points to the phone itself.

The game runs over your local network and can play offline. For firewall setup, custom ports, and recovery, see the [host guide](docs/HOST-GUIDE.md) and [LAN troubleshooting](docs/NETWORK-TROUBLESHOOTING.md).

## Screenshots

This walkthrough follows a three-round demo with 14 fictional players. It shows what the **host**, the **room**, and an individual **player** see at each stage. Click any screenshot to open it at full size.

[Joining](#1-gather-the-players) · [Mini-games](#2-play-a-mini-game-and-enter-scores) · [Voting](#4-predict-discuss-and-vote) · [Finale](#7-play-the-finale) · [Recovery](#8-save-and-recover-a-game)

### 1. Gather the players

Register guests in **Players & roles** and hand each person their six-digit code privately. Everyone scans the same join QR on the projector and enters their own code in their phone's browser. Players can upload a portrait or use their initials.

When the room is ready, start the game. By default there are two Traitors and everyone else is an Innocent. Hand out folded role cards to everyone and privately tell the Traitors who their teammates are. Every player gets the same phone interface.

![Public lobby showing the join QR and the 14-player roster](docs/screenshots/projector-lobby.png)

<p align="center"><a href="docs/screenshots/mobile-join.png"><img src="docs/screenshots/mobile-join.png" width="250" alt="Mobile join screen prompting for the player's six-digit code"></a></p>

*The QR in this demo uses an example address. For a real game, use the join link printed by your server.*

### 2. Play a mini-game and enter scores

Play whatever works for your group: a movie quiz, music guesses, cards, or a tabletop game. In this round, the host opens a PDF clue in **Presentation** and shows it on the projector. The answer stays in the host's hidden answer field until the host reveals it.

| Host · presentation controls | Projector · movie clue |
| :--- | :--- |
| <a href="docs/screenshots/host-presentation.png"><img src="docs/screenshots/host-presentation.png" width="420" alt="The host has a PDF loaded and controls when its answer is revealed"></a> | <a href="docs/screenshots/projector-movie-clue.png"><img src="docs/screenshots/projector-movie-clue.png" width="420" alt="The room sees a movie guessing clue rendered from the uploaded PDF"></a> |

In **Scores & teams**, add points to individuals or groups as you play, or set final round totals afterward. The projector can show the round and overall leaderboards side by side.

| Host · score entry | Projector · standings |
| :--- | :--- |
| <a href="docs/screenshots/host-scores.png"><img src="docs/screenshots/host-scores.png" width="420" alt="Score table with round totals and quick award buttons"></a> | <a href="docs/screenshots/projector-leaderboards.png"><img src="docs/screenshots/projector-leaderboards.png" width="420" alt="Round and overall standings for all 14 demo players"></a> |

### 3. Award the Shield

By default, the highest eligible scorer earns one **Shield**. It protects its holder from murder for the current round. The holder can still be banished by the table. A previously murdered Innocent who wins a Shield can gift it to an active player through the host.

![Host chooses the scoring winner and the Shield recipient before opening predictions](docs/screenshots/host-shield.png)

### 4. Predict, discuss, and vote

Every active player can rank up to five other players on the same **murder prediction** ballot. Only the rankings from Traitors still active after banishment determine the murder. The host closes predictions and starts the **Ring of Doubt**, where players discuss whom they suspect.

| Phone · rank predictions | Phone · discussion |
| :--- | :--- |
| <a href="docs/screenshots/mobile-predictions.png"><img src="docs/screenshots/mobile-predictions.png" width="235" alt="Player ranks two candidates on the private prediction ballot"></a> | <a href="docs/screenshots/mobile-discussion.png"><img src="docs/screenshots/mobile-discussion.png" width="235" alt="Ring of Doubt screen with the discussion timer"></a> |

After discussion, each active player votes for one other player to **banish**. Submitting locks the decision and shows a confirmation on the phone.

| Phone · banishment vote | Phone · vote locked |
| :--- | :--- |
| <a href="docs/screenshots/mobile-ballot.png"><img src="docs/screenshots/mobile-ballot.png" width="235" alt="Player chooses one person on the private banishment ballot"></a> | <a href="docs/screenshots/mobile-vote-sealed.png"><img src="docs/screenshots/mobile-vote-sealed.png" width="235" alt="Decision sealed confirmation on the player phone"></a> |

### 5. Reveal votes and announce eliminations

The **Round desk** shows which players have submitted. The projector's gallery shows portraits, public Shields, and scores while the room waits.

| Host · ballot progress | Projector · portrait gallery |
| :--- | :--- |
| <a href="docs/screenshots/desktop-host.png"><img src="docs/screenshots/desktop-host.png" width="420" alt="Private round desk tracking eight of fourteen submitted decisions"></a> | <a href="docs/screenshots/desktop-projector.png"><img src="docs/screenshots/desktop-projector.png" width="420" alt="Public player gallery with scores and a Shield marker"></a> |

After closing the ballot, reveal **every vote**, one at a time, and let each voter explain their reasoning. The player with the most votes is banished and their role is revealed. If the vote ties, hold a restricted revote; a second tie goes to a host-recorded tie-break.

![Six of fourteen banishment votes have been revealed on the projector](docs/screenshots/projector-vote-reveal.png)

The host then reviews the murder result privately and announces it to the room. In this demo, Casey is banished and revealed as an Innocent. Drew is murdered but can still join offline mini-games and earn points. Drew's phone shows their status and stops offering ballots.

| Projector · banishment | Projector · murder |
| :--- | :--- |
| <a href="docs/screenshots/projector-banishment.png"><img src="docs/screenshots/projector-banishment.png" width="420" alt="Casey is banished and revealed as an Innocent"></a> | <a href="docs/screenshots/projector-murder.png"><img src="docs/screenshots/projector-murder.png" width="420" alt="Drew is announced as murdered and can still play for points"></a> |

<p align="center"><a href="docs/screenshots/mobile-eliminated.png"><img src="docs/screenshots/mobile-eliminated.png" width="250" alt="Drew's mobile screen explains how to keep playing mini-games after murder"></a></p>

### 6. Take an interlude and start the next round

Repeat the mini-game, scoring, Shield, and voting sequence. If a Traitor is banished and another Traitor survives, the survivor can **recruit one active Innocent once per game** before the Finale. The host handles the decision privately and gives everyone the same folded-card interaction.

![Private host recruitment form during a later round's interlude](docs/screenshots/host-recruitment.png)

### 7. Play the Finale

When the table reaches the configured number of active players, murders and recruitment stop. The default is four; this demo uses eight. Each remaining player chooses **TRUST** or **TRAITOR** in private. Unanimous TRUST ends the game. A TRAITOR choice sends the table into another banishment, then another trust decision. The game also ends if only two players remain or the last Traitor is banished.

<p align="center"><a href="docs/screenshots/mobile-finale.png"><img src="docs/screenshots/mobile-finale.png" width="250" alt="Mobile Finale ballot with TRUST and TRAITOR choices"></a></p>

The Innocents win if no Traitor remains. In this demo a Traitor survives the final vote, so the **Traitors win**. The projector separately names Kai the **mini-game champion** with 114 points.

![Final reveal showing the Traitors' victory, Kai's 114 points, and the remaining players' roles](docs/screenshots/projector-finale.png)

### 8. Save and recover a game

The host can use **Recovery & audit** to export a private restore snapshot, restore a game, or review host actions. Copy a snapshot to a second device after setup and after each round so you can recover if the host laptop fails.

![Host screen showing snapshot download, restore, and audit controls](docs/screenshots/host-recovery.png)

## Documentation

- [Host guide](docs/HOST-GUIDE.md) — setup, Wi-Fi, presentation controls, backups, and recovery.
- [Full game rules](docs/RULES.md) — ranking, Shields, ties, departures, and the Finale.
- [Device rehearsal checklist](docs/REHEARSAL.md) — test phones, projector, and an off-device restore before the event.
- [Verification](docs/VERIFICATION.md) and [implementation](docs/IMPLEMENTATION.md) — automated tests, the 14-player rehearsal, and project structure.
