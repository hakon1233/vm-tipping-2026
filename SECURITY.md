# Security

## Reporting a vulnerability

Please report it privately through GitHub: **Security → Report a vulnerability** on this repository. Don't open a public issue. I aim to answer within a week.

Only the `main` branch is maintained. The tournament is over and no instance is running, so reports are about the code.

## Trust model

The app was built for eight friends, so access control is deliberately simple:

- **League PIN.** All players share one PIN, then choose their own name. Anyone with the PIN can act as any player. That was an accepted trade-off for a friends' league, not an oversight.
- **Admin PIN.** Needed for every write under `/api/admin/*`, sent in the `x-admin-pin` header.
- **Both PINs are required.** The server refuses to start without `ADMIN_PIN` and `LEAGUE_PIN`.
- **Guessing is limited.** After 10 wrong PINs from one client, or 100 in total, within 15 minutes, the API answers `429` even for the right PIN. The client is identified by Cloudflare's `CF-Connecting-IP` header. The total cap is a trade-off: someone can block new logins for 15 minutes, but existing sessions keep working, and guessing from many addresses stays bounded.
- **Sessions.** Tokens are 32 random bytes. The server stores only their SHA-256 hash, and they expire after 30 days.
- **Picks stay private** until the group-stage deadline. Before then a player can read only their own picks, and the Excel export (everyone's picks) is closed.
- **Browser access** to the API is limited to the origins in `CORS_ORIGIN`. The API listens on `127.0.0.1` and is meant to sit behind a tunnel or reverse proxy that provides HTTPS.
