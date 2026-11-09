# LAN access troubleshooting

On a phone or streaming device, use the host computer’s Wi-Fi IPv4 address and port. If the host is at 192.168.1.42, use http://192.168.1.42:3000/join for players and http://192.168.1.42:3000/projector for the public screen. Replace that example address with the one printed by your server.

1. Confirm the projector works at http://localhost:3000/projector on the host. If it does not, start the server and check its terminal for errors.
2. Find the host’s Wi-Fi IPv4 address with `ipconfig`. Try that address from the host. Use `netstat -ano | findstr ":3000"` to check that the server listens on `0.0.0.0:3000`. A local test confirms the listener, but does not prove another device can reach it.
3. Connect the phone, projector and host to the same trusted Wi-Fi. Compare their IP addresses and avoid guest networks or router settings that isolate clients. Check local device access settings if a VPN is active.
4. If the app works on the host but remote devices time out, review the host’s firewall. Allow the game port for the Node executable serving the app and the party subnet. Keep the firewall enabled; router port forwarding is unnecessary.

## Windows firewall helper

Use the actual host address, subnet prefix, network profile and port. The example below prints a plan without changing the firewall:

```powershell
./scripts/enable-lan.ps1 -LanAddress 192.168.1.42 -PrefixLength 24 -Profile Private -Port 3000 -Plan
```

If the plan matches the intended LAN, run it from administrator PowerShell without `-Plan`. Use `-NodePath` if the running server uses a different Node executable than the one on PATH. The helper allows the party subnet and blocks access to that port from outside it. It records any changes to existing Node rules and rolls back if it encounters an error.

Undo from administrator PowerShell with the same port used to apply the change:

```powershell
./scripts/enable-lan.ps1 -Port 3000 -Undo
```

Keep the change record under `data/` on the host. Undo before applying a replacement configuration for a changed network, port or executable.
