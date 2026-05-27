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
  sky: {
    objects: [],
    constellations: []
  },
  aircraft: [],
  aircraftEnabled: false,
  aircraftLoading: false,
  aircraftStatus: "desactive",
  selectedId: null,
  debugVisible: false,
  lastSkyUpdate: 0,
  lastAircraftUpdate: 0,
  lastUiUpdate: 0
};

ui.bindDebugToggle((visible) => {
  state.debugVisible = visible;
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
  requestAnimationFrame(loop);
}

function loop(time) {
  if (!state.running) {
    return;
  }

  state.date = new Date();

  if (time - state.lastSkyUpdate > 450) {
    state.sky = computeSky(state.date, state.location);
    state.lastSkyUpdate = time;
  }

  updateAircraftIfNeeded(time);

  renderer.render({
    sky: {
      ...state.sky,
      objects: state.aircraftEnabled ? [...state.sky.objects, ...state.aircraft] : state.sky.objects
    },
    orientation: state.orientation,
    selectedId: state.selectedId
  });

  if (time - state.lastUiUpdate > 250) {
    ui.updateReadouts(state);

    if (state.debugVisible) {
      ui.updateDebug(state);
    }

    state.lastUiUpdate = time;
  }

  requestAnimationFrame(loop);
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

if ("serviceWorker" in navigator && import.meta.env?.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/Starlight/sw.js").catch(() => {});
  });
}
