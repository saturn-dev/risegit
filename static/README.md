# RiseUB static embed (Wayground / jsDelivr / Arctic-style)

This folder holds **SVG embed files** that load your RiseUB server inside sites like Wayground, using the same trick Arctic uses: an SVG with `<foreignObject>` + iframe.

Your **Node server** (`rise.odeatech.com`) still runs the proxy (wisp, scramjet, HTTPS). The SVG is just a portable launcher.

## Quick start

### 1. Build an embed SVG (Roblox example)

```bash
node static/build-embed.mjs --target https://roblox.com
```

This writes `static/embed.svg` pointing at `https://rise.odeatech.com/embed#rv3.…`

### 2. Encode any URL (Arctic `rv3` format)

```bash
node static/rv3.mjs encode "https://roblox.com"
node static/rv3.mjs decode rv3.bf6598f86ac3f94f65d226bb099a52b8122d1ca7016c92
```

### 3. Test directly on your server

After deploying `embed.html` + restarting riseub:

- **https://rise.odeatech.com/embed#rv3.{hash}**
- **https://rise.odeatech.com/embed?$io=https://roblox.com** (Arctic-style)

---

## GitHub + jsDelivr

1. Push this repo to GitHub (include the `static/` folder).
2. Build the SVG:

   ```bash
   node static/build-embed.mjs --target https://roblox.com --github YOUR_USER/riseUB
   ```

3. Commit `static/embed.svg` and open:

   ```
   https://cdn.jsdelivr.net/gh/YOUR_USER/riseUB@main/static/embed.svg#rv3.{hash}
   ```

   Or with Arctic query params:

   ```
   https://cdn.jsdelivr.net/gh/YOUR_USER/riseUB@main/static/embed.svg?$io=https%3A%2F%2Froblox.com
   ```

The SVG iframes your backend — **your VPS must stay online** at the `--backend` URL (default `https://rise.odeatech.com`).

---

## Wayground (`/_media/arctic/…`)

Wayground hosts uploaded SVGs at URLs like:

`https://wayground.com/_media/arctic/{uuid}-v2`

**Steps:**

1. Run `node static/build-embed.mjs --target https://roblox.com` (or whatever site).
2. Upload `static/embed.svg` to Wayground’s Arctic/media uploader (same flow as Arctic).
3. Open the Wayground URL — the SVG runs in-page and loads RiseUB from your server.

If Wayground blocks cross-origin iframes, use their Arctic slot anyway; the SVG `<foreignObject>` pattern is what Arctic uses to get around normal embed filters.

---

## How it compares to Arctic static

| Piece | Arctic (`arctic-static-main/`) | RiseUB |
|--------|--------------------------------|--------|
| UI + proxy runtime | Fully static on jsDelivr | Server at `rise.odeatech.com` |
| Wisp | Public wisp list on GitHub | Your server `/wisp/` |
| SVG launcher | `embed.svg` / `arctic.svg` | `static/embed.svg` (this builder) |
| URL hash | `#rv3.{hex}` | Same encoding (`static/rv3.mjs`) |
| Query param | `$io=https://…` | Supported on `/embed` |

The huge `method` / `arctic.svg` file in your repo is Arctic’s **full app baked into SVG** (~1.8 MB base64). RiseUB uses a **thin SVG** that iframes your server instead — easier to maintain, same Wayground idea.

---

## Deploy checklist

**On your PC:**

```powershell
scp C:\Users\Jacob\Downloads\riseUB\public\embed.html root@198.12.71.132:/opt/riseub/public/
scp C:\Users\Jacob\Downloads\riseUB\public\css\embed.css root@198.12.71.132:/opt/riseub/public/css/
scp C:\Users\Jacob\Downloads\riseUB\public\js\embed-page.js root@198.12.71.132:/opt/riseub/public/js/
scp C:\Users\Jacob\Downloads\riseUB\public\js\embed-url.js root@198.12.71.132:/opt/riseub/public/js/
scp C:\Users\Jacob\Downloads\riseUB\server.js root@198.12.71.132:/opt/riseub/
```

**On the server:**

```bash
systemctl restart riseub
curl -sI https://rise.odeatech.com/embed | head -3
```

**GitHub:**

```bash
git add static/ public/embed.html public/css/embed.css public/js/embed-*.js server.js
git commit -m "Add Arctic-style SVG embed support"
git push
```

---

## Custom backend

```bash
node static/build-embed.mjs \
  --backend https://rise.odeatech.com \
  --target https://www.youtube.com \
  --out static/embed-youtube.svg \
  --github YOUR_USER/riseUB
```
