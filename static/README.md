# RiseUB static embed (100% jsDelivr)

Everything runs from [jsDelivr](https://cdn.jsdelivr.net/) — **no contact with rise.odeatech.com**.

- UI + scramjet vendor → your GitHub → jsDelivr
- Wisp (proxy tunnel) → public servers (same list Arctic uses)
- Login gate → **removed** on static builds
- Settings / themes / history → localStorage

## Build

```bash
node static/build-static.mjs --target https://roblox.com
git add static/
git commit -m "Update static embed"
git push
```

## URLs

**Full app:**
```
https://cdn.jsdelivr.net/gh/saturn-dev/risegit@main/static/riseub/index.html
```

**Embed any site:**
```
https://cdn.jsdelivr.net/gh/saturn-dev/risegit@main/static/embed.svg?$io=https%3A%2F%2Froblox.com
```

**Wayground:** upload `static/embed.svg`

## Notes

| Feature | Static |
|---------|--------|
| Browse any website | Yes (public wisp) |
| Settings | Yes |
| Games | Yes (gfiles CDN) |
| Movies / Music / AI | No backend — won't load media |

Movies/Music/AI need a server API. Browse + settings work fully offline from jsDelivr.
