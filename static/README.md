# RiseUB CDN embed (jsDelivr / Wayground — Arctic-style)

The proxy runs **fully from GitHub CDN** (`cdn.jsdelivr.net`), same as Arctic. No VPS required for embeds.

## Quick start

```bash
node static/build-embed.mjs --target https://roblox.com
```

This writes:
- `arctic-static-main/embed.svg` — main launcher
- `arctic-static-main/f/{id}/{id}/rv3.{hash}` — Arctic-style obfuscated path

## Push to GitHub

```bash
git add arctic-static-main/ static/
git commit -m "Add CDN static proxy for jsDelivr embeds"
git push
```

Wait 1–2 minutes, then open:

```
https://cdn.jsdelivr.net/gh/saturn-dev/risegit@main/arctic-static-main/embed.svg?$io=https%3A%2F%2Froblox.com
```

Or with hash:

```
https://cdn.jsdelivr.net/gh/saturn-dev/risegit@main/arctic-static-main/embed.svg#rv3.bf6598f86ac3f94f65d226bb099a52b8122d1ca7016c92
```

The build script prints the exact `f/` path URL after each run.

## Wayground

1. Run `node static/build-embed.mjs --target https://roblox.com`
2. Upload `arctic-static-main/embed.svg` to Wayground’s Arctic/media uploader
3. Open the Wayground `/_media/arctic/…` URL

Everything loads from jsDelivr — your VPS is **not** involved.

## How it works

| Piece | Location |
|--------|----------|
| SVG launcher | GitHub → jsDelivr |
| Proxy runtime (scramjet, wisp) | `arctic-static-main/` on jsDelivr |
| Wisp servers | Public Arctic wisp list (bundled) |
| Target URL | `#rv3.{hash}` or `?$io=https://…` |

Same `<foreignObject>` + iframe + base64 embed.html pattern as Arctic.

## Encode URLs

```bash
node static/rv3.mjs encode "https://roblox.com"
node static/rv3.mjs decode rv3.bf6598f86ac3f94f65d226bb099a52b8122d1ca7016c92
```

## Custom target

```bash
node static/build-embed.mjs --target https://www.youtube.com --github saturn-dev/risegit
```
