# Rise static (Arctic backend) — v3

Rise UI ported from `public/` with taskbar, browser tabs, settings, and Cinema.

## CDN URLs (use mirrors if jsDelivr is throttled)

**Embed:**
```
https://gcore.jsdelivr.net/gh/saturn-dev/risegit@main/arctic-static-main/example/embed.svg
https://cdn.statically.io/gh/saturn-dev/risegit@main/arctic-static-main/example/embed.svg
https://cdn.jsdelivr.net/gh/saturn-dev/risegit@main/arctic-static-main/example/embed.svg
```

**Quizizz upload:**
```
static/arctic-static-main/example/quizizz.svg
```

Verify you have v3 — view page source should contain `rise-static v3`.

## Rebuild & push

```bash
node static/arctic-static-main/example/build-css.mjs
node static/arctic-static-main/example/build.mjs
git add static/arctic-static-main/example/ arctic-static-main/example/ static/embed.svg
git push origin main
```

Purge cache (if needed, try mirrors first):
```
https://purge.jsdelivr.net/gh/saturn-dev/risegit@main/arctic-static-main/example/embed.svg
```

## What's in v3

- Bottom **taskbar** (Browse, Movies, Settings) like public Rise
- **Browser chrome** — tabs, back/forward/reload, address bar
- **Settings** — themes, taskbar style, search engine, blur/motion toggles
- **Cinema** — hero banner, poster cards with play overlay, VidLink + other providers
- **CDN failover** — gcore → statically → testingcf → jsdelivr
