# Starlight

Starlight is a mobile-first Web AR sky map for GitHub Pages. It uses the phone camera as a full-screen background and renders a transparent real-time overlay with stars, planets, constellations, a compass, a reticle, and tappable object sheets.

## MVP scope

- Full-screen camera through `getUserMedia`.
- GPS location through the browser geolocation API.
- Phone orientation through `DeviceOrientationEvent`, including the iOS permission flow.
- Local time, date, and timezone from the browser.
- Demo mode when camera, GPS, or sensors are not available.
- Canvas overlay with bright stars, major constellations, Sun, Moon, Mercury, Venus, Mars, Jupiter, and Saturn.
- Spherical vector projection for the sky overlay instead of a flat screen offset.
- Optional live aircraft layer from Airplanes.live ADS-B data.
- Bottom sheet for object information.
- Debug panel for latitude, longitude, altitude, azimuth, pitch, roll, timezone, aircraft count, and active mode.
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
  aircraft/
    aircraftService.js  Airplanes.live fetch and aircraft sheet mapping.
  astro/
    catalog.js       Local MVP catalog and information sheets.
    astronomy.js     Time/location astronomy calculations with Astronomy Engine fallback.
  geo/
    topocentric.js   WGS84 target-to-azimuth/elevation conversion.
  render/
    skyRenderer.js   Spherical Canvas AR projection and touch targets.
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

This MVP now uses a hybrid precision layer:

- Stars use fixed right ascension and declination from a small built-in catalog.
- Sun, Moon, and planets use Astronomy Engine from jsDelivr when available.
- If the CDN is unreachable, the app falls back to local approximate orbital calculations.
- Projection uses local spherical vectors, phone heading, pitch, roll, and a practical camera field of view.

For production-grade star density, replace `app/astro/catalog.js` with a generated Gaia DR3 or Hipparcos subset. Keep the renderer contract the same: each object should provide `alt`, `az`, `name`, `type`, `magnitude`, and information sheet fields.

## Live aircraft layer

Starlight queries Airplanes.live around the current GPS position and converts each aircraft latitude, longitude, and altitude to local azimuth/elevation. The layer can be toggled with the `AIR` HUD button.

Known limits:

- Airplanes.live is rate limited, so Starlight polls every 10 seconds.
- ADS-B coverage is incomplete and some aircraft may be hidden, delayed, filtered, or not transmitting.
- The app has no backend, so it only uses public browser-callable endpoints.

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
