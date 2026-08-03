# RiseUB static embed

**Do NOT open `index.html` directly** — use the **SVG embed launcher** (Arctic method).

## Correct URL

```
https://cdn.jsdelivr.net/gh/saturn-dev/risegit@main/static/riseub/embed.svg
```

If `@main` is stale on jsDelivr, pin the commit:

```
https://cdn.jsdelivr.net/gh/saturn-dev/risegit@COMMIT/static/riseub/embed.svg
```

Optional — open a site on boot:

```
.../static/riseub/embed.svg?$io=https%3A%2F%2Fexample.com
```

## How it works

1. `embed.svg` loads on Wayground/jsDelivr
2. SVG iframes `static/riseub/index.html?static=1` from jsDelivr
3. Full RiseUB runs inside the iframe (proxy, settings, games)
4. Public wisp servers — no VPS

## Build & push

```bash
node static/build-static.mjs
git add static/
git commit -m "Update static embed"
git push
```

After push, purge cache if needed:

```
https://purge.jsdelivr.net/gh/saturn-dev/risegit@main/static/riseub/embed.svg
```

## Wayground

Upload `static/riseub/embed.svg` — NOT index.html.
