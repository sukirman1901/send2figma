# Send2Figma landing

Static HTML/CSS/JS site — no build step.

```
landing/
  index.html
  css/
    global.css    # tokens, base, nav
    hero.css
    sections.css
  js/
    icons.js
    motion.js
  public/         # images & icons
  og-image.png
```

## Local preview

```bash
cd landing
python3 -m http.server 8080
```

Open http://127.0.0.1:8080

## Deploy

Upload the **contents** of this folder (keep `index.html` at the site root).

### Cloudflare Pages / Netlify / Vercel

1. Connect the repo (or drag-and-drop this folder)
2. Set **root / publish directory** to `landing`
3. Build command: leave empty

### Checklist

- [ ] Domain DNS points to the host
- [ ] `og-image.png` is reachable at `https://your-domain/og-image.png`
- [ ] If the domain is not `send2figma.com`, update canonical + Open Graph URLs in `index.html`
