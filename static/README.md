# RiseUB static embed

**Do NOT open `index.html` directly** — jsDelivr/Wayground need the **SVG embed launcher** (same as Arctic).

## Correct URL (opens RiseUB — no external site)

```
https://cdn.jsdelivr.net/gh/saturn-dev/risegit@main/static/embed.svg
```

Optional: open a specific site on boot:

```
https://cdn.jsdelivr.net/gh/saturn-dev/risegit@main/static/embed.svg?$io=https%3A%2F%2Fexample.com
```

## How it works (Arctic method)

1. `embed.svg` loads on Wayground/jsDelivr
2. SVG probes CDN, then sets `iframe.src` → `index.html?static=1`
3. Full RiseUB app runs inside the iframe (modules, CSS, settings all work)
4. Public wisp servers handle proxying — no VPS

## Build & push

```bash
node static/build-static.mjs
git add static/
git commit -m "Update embed launcher"
git push
```

## Wayground

Upload `static/embed.svg` — NOT index.html.
