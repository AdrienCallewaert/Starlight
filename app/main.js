import { computeSky } from "./astro/astronomy.js";
import { CameraService } from "./services/camera.js";
import { LocationService } from "./services/location.js";
import { OrientationService } from "./services/orientation.js";
import {
  formatPermissionMessages,
  isSecureRuntime,
  requestOrientationPermission
} from "./services/permissions.js";
import { AircraftService } from "./aircraft/aircraftService.js";
import { SkyRenderer } from "./render/skyRenderer.js";
import { AppUi } from "./ui/appUi.js";
import {
  applyCalibration,
  autoReferenceCandidates,
  calibrationLabel,
  createCalibration,
  createCalibrationFromVector,
  createEmptyCalibration,
  referenceCandidates
} from "./services/calibration.js";
import { detectBrightSpot } from "./services/autoCalibration.js";

const APP_VERSION = "2026.05.27-auto-scan-cal";
const AUTO_SCAN_DURATION = 10000;
const AUTO_SCAN_INTERVAL = 260;
const CACHE_RELOAD_KEY = "starlight-cache-reload-version";
const cacheStatus = {
  reload: ensureVersionedLaunchUrl(APP_VERSION),
  purge: "en cours"
};

purgeBrowserCaches().then((status) => {
  cacheStatus.purge = status;
  state.cacheStatus = status;
});

const ui = new AppUi();
const video = document.querySelector("#cameraFeed");
const canvas = document.querySelector("#skyCanvas");
const renderer = new SkyRenderer(canvas);
const cameraService = new CameraService();
const locationService = new LocationService();
const orientationService = new OrientationService();
const aircraftService = new AircraftService({ radiusNm: 45 });

const state = {
  running: false,
  cameraActive: false,
  date: new Date(),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
  location: {
    latitude: 50.8503,
    longitude: 4.3517,
    altitude: null,
    accuracy: null,
    source: "demo"
  },
  orientation: orientationService.orientation,
  renderOrientation: orientationService.orientation,
  sky: {
    objects: [],
    constellations: []
  },
  aircraft: [],
  aircraftEnabled: false,
  aircraftLoading: false,
  aircraftStatus: "desactive",
  calibration: createEmptyCalibration(),
  calibrationCandidates: [],
  calibrationLabel: "off",
  calibrationPanelVisible: false,
  autoCalibration: {
    scanning: false,
    status: ""
  },
  cacheStatus: cacheStatus.reload ? "reload version" : cacheStatus.purge,
  renderStats: {
    totalObjects: 0,
    aboveHorizon: 0,
    projected: 0,
    horizonClip: true,
    sphereMode: "alt-az"
  },
  appVersion: APP_VERSION,
  selectedId: null,
  debugVisible: false,
  lastSkyUpdate: 0,
  lastAircraftUpdate: 0,
  lastUiUpdate: 0
};

ui.bindDebugToggle((visible) => {
  state.debugVisible = visible;
});

ui.bindCalibrationToggle((visible) => {
  state.calibrationPanelVisible = visible;
  updateCalibrationPanel();
});

ui.bindCalibrationReset(() => {
  stopAutoCalibration("scan annule");
  state.calibration = createEmptyCalibration();
  state.calibrationLabel = calibrationLabel(state.calibration);
  updateCalibrationPanel();
});

ui.bindCalibrationScan(() => {
  startAutoCalibration();
});

ui.bindAircraftToggle((enabled) => {
  state.aircraftEnabled = enabled;
  state.aircraftStatus = enabled ? "reprise" : "desactive";

  if (!enabled) {
    state.aircraft = [];
  } else {
    state.lastAircraftUpdate = 0;
  }
});

ui.bindSheetClose(() => {
  state.selectedId = null;
  ui.closeSheet();
});

ui.startButton.addEventListener("click", startObservation);

canvas.addEventListener("pointerdown", (event) => {
  if (!state.running) {
    return;
  }

  const item = renderer.pick(event.clientX, event.clientY);
  if (!item) {
    state.selectedId = null;
    ui.closeSheet();
    return;
  }

  state.selectedId = item.id;
  ui.openSheet(item);
});

orientationService.addEventListener("change", (event) => {
  state.orientation = event.detail;
});

window.addEventListener("beforeunload", () => {
  cameraService.stop();
  locationService.stop();
  orientationService.stop();
});

async function startObservation() {
  ui.setStarting(true, "Preparation des autorisations...");

  const secureResult = isSecureRuntime()
    ? null
    : {
        status: "denied",
        message: "HTTPS est requis pour la camera, le GPS et les capteurs sur mobile."
      };

  const orientationResult = await requestOrientationPermission();
  ui.showExperience();
  ui.setStarting(false);

  const [cameraResult, locationResult] = await Promise.all([
    secureResult ? Promise.resolve({ status: "denied", message: "Camera bloquee hors HTTPS." }) : cameraService.start(video),
    locationService.request()
  ]);

  state.cameraActive = cameraResult.status === "granted";
  state.location = locationResult.location;
  ui.setCameraFallback(!state.cameraActive);

  orientationService.start(orientationResult.status);
  locationService.watch((location) => {
    state.location = location;
  });

  const message = formatPermissionMessages([secureResult, orientationResult, cameraResult, locationResult]);
  ui.showBanner(message);

  state.running = true;
  state.sky = computeSky(new Date(), state.location);
  state.calibrationCandidates = referenceCandidates(state.sky.objects);
  updateCalibrationPanel();
  requestAnimationFrame(loop);
}

function loop(time) {
  if (!state.running) {
    return;
  }

  state.date = new Date();

  if (time - state.lastSkyUpdate > 450) {
    state.sky = computeSky(state.date, state.location);
    state.calibrationCandidates = referenceCandidates(state.sky.objects);
    state.lastSkyUpdate = time;
  }

  updateAircraftIfNeeded(time);

  const objects = state.aircraftEnabled ? [...state.sky.objects, ...state.aircraft] : state.sky.objects;
  state.renderOrientation = applyCalibration(state.orientation, state.calibration);
  state.calibrationLabel = calibrationLabel(state.calibration);
  state.renderStats = renderer.render({
    sky: {
      ...state.sky,
      objects
    },
    orientation: state.renderOrientation,
    selectedId: state.selectedId
  });

  if (time - state.lastUiUpdate > 250) {
    ui.updateReadouts(state);

    if (state.debugVisible) {
      ui.updateDebug({
        ...state,
        orientation: state.renderOrientation
      });
    }

    if (state.calibrationPanelVisible) {
      updateCalibrationPanel();
    }

    state.lastUiUpdate = time;
  }

  requestAnimationFrame(loop);
}

function calibrateOnReference(referenceId) {
  stopAutoCalibration("");
  const reference = state.sky.objects.find((object) => object.id === referenceId);

  if (!reference) {
    return;
  }

  state.calibration = createCalibration(reference, state.orientation);
  state.calibrationLabel = calibrationLabel(state.calibration);
  state.selectedId = reference.id;
  updateCalibrationPanel();
}

function startAutoCalibration() {
  if (!state.running || state.autoCalibration.scanning) {
    return;
  }

  if (!video.videoWidth || !video.videoHeight) {
    state.autoCalibration.status = "Camera pas encore prete.";
    updateCalibrationPanel();
    return;
  }

  state.calibrationPanelVisible = true;
  ui.setCalibrationPanelVisible(true);
  state.autoCalibration = {
    scanning: true,
    status: "Balayage lent du ciel, ne vise pas directement le Soleil.",
    startedAt: performance.now(),
    best: null,
    samples: 0,
    timer: window.setInterval(takeAutoCalibrationSample, AUTO_SCAN_INTERVAL)
  };
  updateCalibrationPanel();

  window.setTimeout(() => {
    if (state.autoCalibration.scanning) {
      finishAutoCalibration();
    }
  }, AUTO_SCAN_DURATION);
}

function takeAutoCalibrationSample() {
  const scan = state.autoCalibration;

  if (!scan.scanning) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const spot = detectBrightSpot(video, rect.width, rect.height);
  const elapsed = performance.now() - scan.startedAt;
  const remaining = Math.max(0, Math.ceil((AUTO_SCAN_DURATION - elapsed) / 1000));

  scan.samples += 1;

  if (!spot) {
    scan.status = `Scan ${remaining}s - cherche une zone lumineuse.`;
    updateCalibrationPanel();
    return;
  }

  const match = matchBrightSpotToReference(spot);

  if (match && (!scan.best || match.score > scan.best.score)) {
    scan.best = match;
  }

  scan.status = scan.best
    ? `Scan ${remaining}s - meilleur repere: ${scan.best.reference.name}.`
    : `Scan ${remaining}s - lumiere detectee, pas encore coherente.`;
  updateCalibrationPanel();
}

function matchBrightSpotToReference(spot) {
  const references = autoReferenceCandidates(state.sky.objects);
  const maxDistance = Math.max(92, Math.min(renderer.width || canvas.clientWidth, renderer.height || canvas.clientHeight) * 0.3);
  let best = null;

  for (const reference of references) {
    const point = renderer.project(reference, state.orientation);

    if (!point.visible) {
      continue;
    }

    const distance = Math.hypot(point.x - spot.x, point.y - spot.y);

    if (distance > maxDistance) {
      continue;
    }

    const score =
      referenceBoost(reference) +
      (1 - distance / maxDistance) * 82 +
      spot.confidence * 34 -
      Math.max(0, typeof reference.magnitude === "number" ? reference.magnitude : 0) * 3;

    if (!best || score > best.score) {
      best = {
        reference,
        score,
        distance,
        observedVector: renderer.screenToWorldVector(spot.x, spot.y, state.orientation)
      };
    }
  }

  return best;
}

function finishAutoCalibration() {
  const scan = state.autoCalibration;

  if (scan.timer) {
    window.clearInterval(scan.timer);
  }

  if (scan.best && scan.best.score >= 58) {
    state.calibration = createCalibrationFromVector(scan.best.reference, scan.best.observedVector);
    state.calibrationLabel = calibrationLabel(state.calibration);
    state.selectedId = scan.best.reference.id;
    state.autoCalibration = {
      scanning: false,
      status: `Auto cale sur ${scan.best.reference.name}, ecart ${state.calibration.errorDeg.toFixed(1)} deg.`
    };
  } else {
    state.autoCalibration = {
      scanning: false,
      status: "Scan termine: repere trop incertain."
    };
  }

  updateCalibrationPanel();
}

function stopAutoCalibration(status) {
  const scan = state.autoCalibration;

  if (scan?.timer) {
    window.clearInterval(scan.timer);
  }

  state.autoCalibration = {
    scanning: false,
    status
  };
}

function updateCalibrationPanel() {
  ui.updateCalibrationPanel({
    candidates: state.calibrationCandidates,
    calibration: state.calibration,
    scanStatus: state.autoCalibration.status,
    scanning: state.autoCalibration.scanning,
    onCalibrate: calibrateOnReference
  });
}

function referenceBoost(reference) {
  if (reference.category === "moon") {
    return 60;
  }

  if (reference.category === "sun") {
    return 48;
  }

  if (reference.category === "planet") {
    return 30;
  }

  return 12;
}

function updateAircraftIfNeeded(time) {
  if (!state.aircraftEnabled || state.aircraftLoading || time - state.lastAircraftUpdate < 10000) {
    return;
  }

  state.aircraftLoading = true;
  state.aircraftStatus = "synchro";
  state.lastAircraftUpdate = time;

  aircraftService
    .fetchNearby(state.location)
    .then((result) => {
      state.aircraft = result.aircraft;
      state.aircraftStatus = `${result.count} live`;
    })
    .catch((error) => {
      state.aircraftStatus = "indisponible";
      state.aircraft = [];
    })
    .finally(() => {
      state.aircraftLoading = false;
    });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
  });
}

if ("caches" in window) {
  window.addEventListener("load", () => {
    caches.keys().then((keys) => {
      keys.filter(shouldDeleteCache).forEach((key) => caches.delete(key));
    });
  });
}

function ensureVersionedLaunchUrl(version) {
  if (!window.location.protocol.startsWith("http")) {
    return false;
  }

  const url = new URL(window.location.href);

  if (url.searchParams.get("v") === version) {
    sessionStorage.removeItem(CACHE_RELOAD_KEY);
    return false;
  }

  if (sessionStorage.getItem(CACHE_RELOAD_KEY) === version) {
    return false;
  }

  sessionStorage.setItem(CACHE_RELOAD_KEY, version);
  url.searchParams.set("v", version);
  url.searchParams.set("t", Date.now().toString(36));
  window.location.replace(url);
  return true;
}

async function purgeBrowserCaches() {
  const results = [];

  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      results.push(`${registrations.length} sw`);
    } catch (error) {
      results.push("sw err");
    }
  }

  if ("caches" in window) {
    try {
      const keys = await caches.keys();
      const deletedKeys = keys.filter(shouldDeleteCache);
      await Promise.all(deletedKeys.map((key) => caches.delete(key)));
      results.push(`${deletedKeys.length} cache`);
    } catch (error) {
      results.push("cache err");
    }
  }

  return results.length ? results.join(" / ") : "aucun";
}

function shouldDeleteCache(key) {
  return key.toLowerCase().includes("starlight");
}
