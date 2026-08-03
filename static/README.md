# RiseUB static embed

**Do NOT open `index.html` directly** — jsDelivr/Wayground need the **SVG embed launcher** (same as Arctic).

## Correct URLs

```
https://cdn.jsdelivr.net/gh/saturn-dev/risegit@main/static/embed.svg?$io=https%3A%2F%2Froblox.com
```

Or from the riseub folder:

```
https://cdn.jsdelivr.net/gh/saturn-dev/risegit@main/static/riseub/embed.svg?$io=https%3A%2F%2Froblox.com
```

With hash:

```
https://cdn.jsdelivr.net/gh/saturn-dev/risegit@main/static/embed.svg#rv3.bf6598f86ac3f94f65d226bb099a52b8122d1ca7016c92
```

## How it works (Arctic method)

1. `embed.svg` loads on Wayground/jsDelivr
2. SVG probes CDN, then sets `iframe.src` → `index.html?static=1&$io=…`
3. Full RiseUB app runs inside the iframe (modules, CSS, settings all work)
4. Public wisp servers handle proxying — no VPS

## Build & push

```bash
node static/build-static.mjs --target https://roblox.com
git add static/
git commit -m "Update embed launcher"
git push
```

## Wayground

Upload `static/embed.svg` — NOT index.html.
