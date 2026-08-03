# Rise static (Arctic backend) — v2

Simple Rise embed: top bar with search, Browse + Movies tabs, Cinema with player.

## CDN URLs (use mirrors if jsDelivr is throttled)

**Embed (most hosts):**
```
https://gcore.jsdelivr.net/gh/saturn-dev/risegit@main/arctic-static-main/example/embed.svg
https://cdn.statically.io/gh/saturn-dev/risegit@main/arctic-static-main/example/embed.svg
https://cdn.jsdelivr.net/gh/saturn-dev/risegit@main/arctic-static-main/example/embed.svg
```

**Quizizz upload (use this file — Quizizz strips foreignObject from embed.svg):**
```
https://cdn.jsdelivr.net/gh/saturn-dev/risegit@main/arctic-static-main/example/quizizz.svg
```

Verify version — view page source should contain `rise-static v2`.

## Rebuild & push

```bash
node static/arctic-static-main/example/build.mjs
git add static/arctic-static-main/example/ arctic-static-main/example/ static/embed.svg
git push origin main
```

Purge cache (if needed):
```
https://purge.jsdelivr.net/gh/saturn-dev/risegit@main/arctic-static-main/example/embed.svg
```

## Features

- **Browse** — search bar, proxy navigation
- **Movies** — TMDB rows (trending, popular, top rated), search, VidLink + 5 other providers
- **Player** — back button, server picker, season/episode for series
- **quizizz.svg** — separate launcher for Quizizz/Wayground
