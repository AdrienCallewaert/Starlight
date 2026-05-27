import { round } from "../utils/math.js";

export class AppUi {
  constructor() {
    this.startScreen = document.querySelector("#startScreen");
    this.experience = document.querySelector("#experience");
    this.startButton = document.querySelector("#startButton");
    this.startStatus = document.querySelector("#startStatus");
    this.permissionBanner = document.querySelector("#permissionBanner");
    this.timeReadout = document.querySelector("#timeReadout");
    this.locationReadout = document.querySelector("#locationReadout");
    this.debugToggle = document.querySelector("#debugToggle");
    this.calibrationToggle = document.querySelector("#calibrationToggle");
    this.aircraftToggle = document.querySelector("#aircraftToggle");
    this.debugPanel = document.querySelector("#debugPanel");
    this.calibrationPanel = document.querySelector("#calibrationPanel");
    this.calibrationCandidates = document.querySelector("#calibrationCandidates");
    this.calibrationScan = document.querySelector("#calibrationScan");
    this.calibrationReset = document.querySelector("#calibrationReset");
    this.calibrationStatus = document.querySelector("#calibrationStatus");
    this.sheet = document.querySelector("#infoSheet");
    this.sheetClose = document.querySelector("#sheetClose");
    this.sheetType = document.querySelector("#sheetType");
    this.sheetTitle = document.querySelector("#sheetTitle");
    this.sheetConstellation = document.querySelector("#sheetConstellation");
    this.sheetDistance = document.querySelector("#sheetDistance");
    this.sheetMagnitude = document.querySelector("#sheetMagnitude");
    this.sheetDescription = document.querySelector("#sheetDescription");
    this.sheetHistory = document.querySelector("#sheetHistory");
    this.sheetFacts = document.querySelector("#sheetFacts");
    this.debugFields = {
      mode: document.querySelector("#debugMode"),
      lat: document.querySelector("#debugLat"),
      lon: document.querySelector("#debugLon"),
      altitude: document.querySelector("#debugAltitude"),
      heading: document.querySelector("#debugHeading"),
      pitch: document.querySelector("#debugPitch"),
      roll: document.querySelector("#debugRoll"),
      timezone: document.querySelector("#debugTimezone"),
      horizon: document.querySelector("#debugHorizon"),
      sphere: document.querySelector("#debugSphere"),
      calibration: document.querySelector("#debugCalibration"),
      cache: document.querySelector("#debugCache"),
      aircraft: document.querySelector("#debugAircraft"),
      version: document.querySelector("#debugVersion")
    };

    this.timeFormatter = new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  setStarting(isStarting, message = "") {
    this.startButton.disabled = isStarting;
    this.startStatus.textContent = message;
  }

  showExperience() {
    this.startScreen.classList.add("is-hidden");
    this.experience.classList.remove("is-hidden");
  }

  setCameraFallback(isFallback) {
    this.experience.classList.toggle("is-demo", isFallback);
  }

  showBanner(message) {
    this.permissionBanner.textContent = message;
    this.permissionBanner.classList.toggle("is-visible", Boolean(message));
  }

  bindDebugToggle(onToggle) {
    this.debugToggle.addEventListener("click", () => {
      const next = this.debugToggle.getAttribute("aria-pressed") !== "true";
      this.debugToggle.setAttribute("aria-pressed", String(next));
      this.debugPanel.classList.toggle("is-hidden", !next);
      onToggle(next);
    });
  }

  bindAircraftToggle(onToggle) {
    this.aircraftToggle.addEventListener("click", () => {
      const next = this.aircraftToggle.getAttribute("aria-pressed") !== "true";
      this.aircraftToggle.setAttribute("aria-pressed", String(next));
      onToggle(next);
    });
  }

  bindCalibrationToggle(onToggle) {
    this.calibrationToggle.addEventListener("click", () => {
      const next = this.calibrationToggle.getAttribute("aria-pressed") !== "true";
      this.setCalibrationPanelVisible(next);
      onToggle(next);
    });
  }

  bindCalibrationReset(onReset) {
    this.calibrationReset.addEventListener("click", onReset);
  }

  bindCalibrationScan(onScan) {
    this.calibrationScan.addEventListener("click", onScan);
  }

  bindSheetClose(onClose) {
    this.sheetClose.addEventListener("click", onClose);
  }

  updateReadouts({ date, location }) {
    this.timeReadout.textContent = this.timeFormatter.format(date);
    this.locationReadout.textContent = formatLocation(location);
  }

  setCalibrationPanelVisible(visible) {
    this.calibrationToggle.setAttribute("aria-pressed", String(visible));
    this.calibrationPanel.classList.toggle("is-hidden", !visible);
  }

  updateCalibrationPanel({ candidates, calibration, scanStatus, scanning, onCalibrate }) {
    const buttons = candidates.map((candidate) => {
      const button = document.createElement("button");
      button.className = "calibration-chip";
      button.type = "button";
      button.textContent = formatCandidate(candidate);
      button.classList.toggle("is-active", calibration?.referenceId === candidate.id);
      button.addEventListener("click", () => onCalibrate(candidate.id));
      return button;
    });

    this.calibrationScan.disabled = Boolean(scanning);
    this.calibrationCandidates.replaceChildren(...buttons);
    this.calibrationStatus.textContent = scanStatus || calibrationStatusText(calibration, candidates.length);
  }

  updateDebug({
    location,
    orientation,
    timezone,
    cameraActive,
    aircraft,
    aircraftEnabled,
    aircraftStatus,
    cacheStatus,
    calibration,
    calibrationLabel,
    renderStats,
    appVersion
  }) {
    const sensorMode = orientation.source === "demo" ? "capteurs demo" : orientation.source;
    this.debugFields.mode.textContent = cameraActive ? sensorMode : `camera demo / ${sensorMode}`;
    this.debugFields.lat.textContent = formatNumber(location.latitude, 5);
    this.debugFields.lon.textContent = formatNumber(location.longitude, 5);
    this.debugFields.altitude.textContent =
      typeof location.altitude === "number" ? `${Math.round(location.altitude)} m` : "--";
    const displayRoll = typeof orientation.rawRoll === "number" ? orientation.rawRoll : orientation.roll;
    this.debugFields.heading.textContent = `${round(orientation.heading, 1)} deg`;
    this.debugFields.pitch.textContent = `${round(orientation.pitch, 1)} deg`;
    this.debugFields.roll.textContent = `${round(displayRoll, 1)} deg`;
    this.debugFields.timezone.textContent = timezone;
    this.debugFields.horizon.textContent = renderStats
      ? `${renderStats.projected}/${renderStats.aboveHorizon}/${renderStats.totalObjects} clip`
      : "--";
    this.debugFields.sphere.textContent = renderStats?.sphereMode || "--";
    this.debugFields.calibration.textContent = calibrationLabel || (calibration?.active ? calibration.referenceName : "off");
    this.debugFields.cache.textContent = cacheStatus || "--";
    this.debugFields.aircraft.textContent = aircraftEnabled ? `${aircraft.length} / ${aircraftStatus}` : "off";
    this.debugFields.version.textContent = appVersion;
  }

  openSheet(item) {
    this.sheetType.textContent = item.type || "Objet celeste";
    this.sheetTitle.textContent = item.name;
    this.sheetConstellation.textContent = item.constellation || "--";
    this.sheetDistance.textContent = item.distance || "--";
    this.sheetMagnitude.textContent =
      typeof item.magnitude === "number" ? item.magnitude.toFixed(2).replace(/\.00$/, "") : item.magnitude || "--";
    this.sheetDescription.textContent = item.description || "";
    this.sheetHistory.textContent = item.history || "";
    this.sheetFacts.replaceChildren(...(item.facts || []).map((fact) => createFactItem(fact)));
    this.sheet.classList.add("is-open");
    this.sheet.setAttribute("aria-hidden", "false");
  }

  closeSheet() {
    this.sheet.classList.remove("is-open");
    this.sheet.setAttribute("aria-hidden", "true");
  }
}

function createFactItem(text) {
  const item = document.createElement("li");
  item.textContent = text;
  return item;
}

function formatLocation(location) {
  const prefix = location.source === "demo" ? "Demo" : "GPS";
  return `${prefix} ${formatNumber(location.latitude, 3)}, ${formatNumber(location.longitude, 3)}`;
}

function formatCandidate(candidate) {
  const altitude = typeof candidate.alt === "number" ? `${Math.round(candidate.alt)} deg` : "--";
  return `${candidate.name} ${altitude}`;
}

function calibrationStatusText(calibration, count) {
  if (calibration?.active) {
    return `${calibration.referenceName} cale, erreur ${calibration.errorDeg.toFixed(1)} deg.`;
  }

  return count > 0 ? "Vise au centre, puis touche un repere." : "Aucun repere brillant au-dessus de l'horizon.";
}

function formatNumber(value, decimals) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
  }

  return value.toFixed(decimals);
}
