# Rise static (Arctic backend)

Rise-themed UI using the **arctic-static-main** proxy stack.

## CDN URLs

**Embed (use this on any site):**
```
https://cdn.jsdelivr.net/gh/saturn-dev/risegit@main/arctic-static-main/example/embed.svg
```

Open a site on boot:
```
.../embed.svg?$io=https%3A%2F%2Froblox.com
```

Proxy assets (`resolver`, `sw.js`, `vendor/`) live at repo root `arctic-static-main/` — the embed sets `<base href>` there automatically.

## Files

| File | Purpose |
|------|---------|
| `static/arctic-static-main/example/index.html` | Rise UI (edit here) |
| `static/arctic-static-main/example/rise-app.js` | Browse + movies logic |
| `static/arctic-static-main/example/rise.css` | Mint theme |
| `static/arctic-static-main/example/embed.svg` | SVG launcher |

`build.mjs` syncs to `arctic-static-main/example/` for GitHub/jsDelivr.

## Rebuild

```bash
node static/arctic-static-main/example/build.mjs
git add static/arctic-static-main/example/ arctic-static-main/example/
git push
```

Purge cache if needed:
```
https://purge.jsdelivr.net/gh/saturn-dev/risegit@main/arctic-static-main/example/embed.svg
```
