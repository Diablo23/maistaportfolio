# Web3 Motion Designer — Portfolio

A single-page, scroll-driven portfolio. Palette: **#FF8D1B** (primary) / **#252525** (secondary).

## Run it
Just open `index.html` in a browser. For best results (video autoplay, no CORS issues) serve it locally:

```bash
# from inside this folder
python3 -m http.server 8000
# then visit http://localhost:8000
```

Or drop the whole folder onto Netlify / Vercel / GitHub Pages — it's pure static HTML/CSS/JS, no build step.

## The scroll story
1. **Enter** — intro card "Self-taught Web3 Motion Designer" above the showreel.
2. **First scroll** — the showreel grows to full screen, the text fades away.
3. **Second scroll** — the showreel splits into six reels that scatter and float.
   - **Hover** a reel → it zooms 2×.
   - **Click** a reel → it opens full-screen and plays from the start.
4. **Scroll up** reverses the whole sequence (it's driven by scroll position, not events).
5. **Below** — the full site: the six-reel grid, a "Contributed to" field of floating logos
   (hover → 2.5×), the **$99.99** offer, and a **Contact via Telegram** button.

The orange background is filled with translucent dark squares/circles/diamonds that drift and
**morph into a different shape on hover**.

## Customize

### Your videos
Replace the placeholder files in `assets/videos/`:
- `showreel.mp4` + `showreel-poster.jpg` — the main reel.
- `reel-1.mp4` … `reel-6.mp4` — the six clips.

Keep the same filenames and nothing else needs to change. To rename them or change labels,
edit the `REELS` array near the top of `js/main.js`.

### Telegram link
In `index.html`, change the contact button's `href`:
```html
<a class="contact-btn ..." href="https://t.me/your_username" ...>
```
Replace `your_username` with your real Telegram handle.

### Colors / fonts
Colors live as CSS variables at the top of `css/styles.css` (`--orange`, `--dark`).
Fonts are Clash Display + Satoshi, loaded from Fontshare in `index.html`.

### Logos ("Contributed to")
Edit the `names` array inside `buildLogos()` in `js/main.js`. To use real logo images instead
of text squares, swap the `el.textContent = nm;` line for an `<img>`.

## Notes
- The included videos are auto-generated **placeholders** so the site is alive out of the box —
  swap them for your real work.
- Best viewed on desktop; the layout adapts down to mobile.
