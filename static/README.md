# Rise static (Arctic backend)

Uses **arctic-static-main** proxy backend with a **Rise-themed UI**.

## Files (in `arctic-static-main/example/`)

| File | Purpose |
|------|---------|
| `index.html` | Rise app shell (browse + movies) |
| `rise-app.js` | App logic, uses Arctic resolver/router |
| `rise.css` | Rise mint theme |
| `embed.svg` | SVG launcher for any site (Wayground, jsDelivr, etc.) |
| `svg.svg` | Same as embed.svg (upload either) |

## CDN URLs

```
https://cdn.jsdelivr.net/gh/saturn-dev/risegit@main/static/arctic-static-main/example/embed.svg
```

Open a site on boot:

```
.../embed.svg?$io=https%3A%2F%2Froblox.com
```

## Rebuild after edits

```bash
node static/arctic-static-main/example/build.mjs
git add static/arctic-static-main/example/
git push
```

## How it works

1. `embed.svg` decodes `index.html` via srcdoc (Arctic method — avoids jsDelivr `text/plain` HTML bug)
2. Injects `<base href="CDN/example/">` so assets load from jsDelivr
3. `rise-app.js` imports Arctic `resolver-kJ4LsXVq.js` for wisp + scramjet proxy
4. Movies use TMDB + vidking embed, proxied through the same backend
