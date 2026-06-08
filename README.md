# 🚀 Mission Across the Universe

An interactive 3D educational space game. Design your own rover, then drive it
across the solar system completing missions and learning real facts about every
world — from the Moon to the Sun.

Built with [Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/),
and deployed automatically to GitHub Pages.

## 🎮 How to play

1. **Design your rover** — choose a body shape (Explorer, Hauler or Hopper),
   give it a name, and pick a colour.
2. **Land on each world** and read the mission briefing.
3. **Complete the missions** shown in the panel on the side of the screen, e.g.
   *"Collect 10 rocks"*, *"Drive to the beacon"*, *"Scan the ice ridge"*.
4. Finish every mission to **travel to the next planet**.
5. Cross all 10 worlds — Moon → Mars → Mercury → Venus → Jupiter → Saturn →
   Uranus → Neptune → Pluto → ☀️ the Sun — to win!

### Controls

| Action | Keys |
| ------ | ---- |
| Drive forward | `W` / `↑` |
| Reverse | `S` / `↓` |
| Turn left | `A` / `←` |
| Turn right | `D` / `→` |
| Change rover colour | 🎨 button (top-right) — anytime |
| Rover garage & upgrades | 🛠️ button (top-right) |

### Upgrade your rover

The more missions you complete, the more your rover upgrades — bigger wheels,
solar panels, a high-gain antenna, a sample drill, a nuclear battery and more.
Each upgrade teaches you something about how real space rovers are designed.

### Watch the heat ☀️

On the final mission to the Sun, keep an eye on your **HEAT** gauge. Collect
plasma samples to cool down before you overheat!

## 🛠️ Development

```bash
npm install      # install dependencies
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # production build into dist/
npm run preview  # preview the production build
```

## 🌍 Deployment (GitHub Pages)

Pushing to `master` triggers the workflow in
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which builds the
site and publishes `dist/` to GitHub Pages.

Enable it once in **Settings → Pages → Build and deployment → Source → GitHub
Actions**. The site is served at
`https://<user>.github.io/mission-across-the-universe/` (the Vite `base` is set
to match this path during CI).

## 📚 Credits

Planet, star and Sun surface maps are by
[Solar System Scope](https://www.solarsystemscope.com/textures/), licensed under
**CC BY 4.0**. The Pluto map is from NASA's New Horizons mission (public domain,
via Wikimedia Commons). Full details in
[`public/textures/CREDITS.txt`](public/textures/CREDITS.txt).

All planetary facts are for educational use. Made for curious explorers of all
ages. 🪐
