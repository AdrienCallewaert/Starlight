import { geodeticTargetToHorizontal } from "../geo/topocentric.js";
import { isFiniteNumber, normalizeDegrees } from "../utils/math.js";

const API_ROOT = "https://api.airplanes.live/v2";
const FEET_TO_METERS = 0.3048;
const KNOTS_TO_KMH = 1.852;

export class AircraftService {
  constructor({ radiusNm = 45 } = {}) {
    this.radiusNm = radiusNm;
  }

  async fetchNearby(location) {
    const latitude = roundCoordinate(location.latitude);
    const longitude = roundCoordinate(location.longitude);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(`${API_ROOT}/point/${latitude}/${longitude}/${this.radiusNm}`, {
        cache: "no-store",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Airplanes.live HTTP ${response.status}`);
      }

      const payload = await response.json();
      const aircraft = (payload.ac || [])
        .map((record) => toSkyAircraft(record, location))
        .filter(Boolean)
        .sort((a, b) => a.slantDistanceMeters - b.slantDistanceMeters)
        .slice(0, 35);

      return {
        status: "ok",
        count: aircraft.length,
        fetchedAt: new Date(),
        aircraft
      };
    } finally {
      window.clearTimeout(timeout);
    }
  }
}

function toSkyAircraft(record, observer) {
  if (!isFiniteNumber(record.lat) || !isFiniteNumber(record.lon)) {
    return null;
  }

  const altitudeMeters = altitudeFromRecord(record);
  const horizontal = geodeticTargetToHorizontal(observer, {
    latitude: record.lat,
    longitude: record.lon,
    altitude: altitudeMeters
  });

  const callSign = cleanText(record.flight);
  const registration = cleanText(record.r);
  const aircraftType = cleanText(record.t);
  const name = callSign || registration || (record.hex ? record.hex.toUpperCase() : "Avion");
  const speedKmh = isFiniteNumber(record.gs) ? Math.round(record.gs * KNOTS_TO_KMH) : null;
  const track = isFiniteNumber(record.track) ? normalizeDegrees(record.track) : null;
  const altitudeLabel = isFiniteNumber(altitudeMeters)
    ? `${Math.round(altitudeMeters).toLocaleString("fr-FR")} m`
    : "Altitude inconnue";
  const distanceKm = horizontal.slantDistanceMeters / 1000;

  return {
    id: `aircraft-${record.hex || name}`,
    category: "aircraft",
    name,
    type: "Avion ADS-B",
    constellation: "Trafic aerien",
    distance: `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km`,
    magnitude: "Live",
    color: "#9af0c1",
    az: horizontal.az,
    alt: horizontal.alt,
    track,
    altitudeMeters,
    slantDistanceMeters: horizontal.slantDistanceMeters,
    description: `${cleanText(record.desc) || "Aeronef detecte par ADS-B"}${aircraftType ? ` (${aircraftType})` : ""}.`,
    history: "Position temps reel fournie par Airplanes.live selon la couverture ADS-B disponible.",
    facts: [
      registration ? `Immatriculation: ${registration}` : null,
      `Altitude: ${altitudeLabel}`,
      speedKmh ? `Vitesse sol: ${speedKmh} km/h` : null,
      track !== null ? `Cap: ${Math.round(track)} deg` : null,
      isFiniteNumber(record.seen) ? `Dernier signal: ${record.seen.toFixed(1)} s` : null
    ].filter(Boolean)
  };
}

function altitudeFromRecord(record) {
  const altitudeFeet = numericAltitude(record.alt_geom) ?? numericAltitude(record.alt_baro);
  return altitudeFeet === null ? 0 : altitudeFeet * FEET_TO_METERS;
}

function numericAltitude(value) {
  if (isFiniteNumber(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function roundCoordinate(value) {
  return Number(value).toFixed(4);
}
