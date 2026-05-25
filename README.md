# Starlight

Starlight is a mobile-first Web AR sky map for GitHub Pages. It uses the phone camera as a full-screen background and renders a transparent real-time overlay with stars, planets, constellations, a compass, a reticle, and tappable object sheets.

## MVP scope

- Full-screen camera through `getUserMedia`.
- GPS location through the browser geolocation API.
- Phone orientation through `DeviceOrientationEvent`, including the iOS permission flow.
- Local time, date, and timezone from the browser.
- Demo mode when camera, GPS, or sensors are not available.
- Canvas overlay with bright stars, major constellations, Sun, Moon, Mercury, Venus, Mars, Jupiter, and Saturn.
- Bottom sheet for object information.
- Debug panel for latitude, longitude, altitude, azimuth, pitch, roll, timezone, and active mode.
- Static PWA structure that can be hosted on GitHub Pages.

## Install

```bash
npm install
```

## Run locally

```bash
npm run dev
```

Open the local URL printed by Vite. With the current GitHub Pages base path, the app is available at:

```text
http://localhost:5173/Starlight/
```

Camera, geolocation, and orientation permissions work only on HTTPS or on localhost. For a real mobile test, deploy to GitHub Pages or expose the dev server over HTTPS.

## Build

```bash
npm run build
```

The static output is written to `dist/`.

## GitHub Pages deployment

This project is configured for the repository URL:

```text
https://adriencallewaert.github.io/Starlight/
```

The Vite base path is set in `vite.config.js`:

```js
base: "/Starlight/"
```

Recommended setup:

1. Push the repository to GitHub.
2. In GitHub, open Settings > Pages.
3. Set Source to GitHub Actions.
4. Push to `main`.
5. The workflow `.github/workflows/pages.yml` builds `dist/` and deploys it.

## Project structure

```text
app/
  astro/
    catalog.js       Local MVP catalog and information sheets.
    astronomy.js     Time/location astronomy calculations.
  render/
    skyRenderer.js   Canvas AR projection and touch targets.
  services/
    camera.js        Camera permission and stream handling.
    location.js      GPS permission, fallback, and watch.
    orientation.js   Device orientation and demo orientation.
    permissions.js   Shared permission helpers.
  ui/
    appUi.js         HUD, debug panel, and bottom sheet.
  utils/
    math.js          Shared math helpers.
```

## Astronomy accuracy

This MVP intentionally uses local low-precision formulae:

- Stars use fixed right ascension and declination from a small built-in catalog.
- Sun, Moon, and planets use approximate orbital calculations.
- Projection uses phone heading, pitch, and roll with a practical camera field of view.

For production precision, replace the calculation layer in `app/astro/astronomy.js` with a library such as `astronomy-engine`, a richer star catalog, or a VSOP87 based implementation. Keep the renderer contract the same: each object should provide `alt`, `az`, `name`, `type`, `magnitude`, and information sheet fields.

## Mobile browser limits

- iOS Safari requires a user gesture before `DeviceOrientationEvent.requestPermission()`.
- iOS may not expose a true compass heading in every context.
- Android Chrome support varies by device calibration and sensor availability.
- Camera, GPS, and sensors require HTTPS except on localhost.
- Some browsers throttle animation or sensor events in background tabs.
- GPS altitude is often missing or noisy.
- The browser camera FOV is estimated, so AR alignment is useful but not survey-grade.

## No backend

Starlight is 100 percent front-end. It does not require a server, database, paid API, or native application wrapper.
