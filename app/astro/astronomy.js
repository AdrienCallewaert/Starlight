import { CONSTELLATIONS, SOLAR_SYSTEM_OBJECTS, STARS } from "./catalog.js";
import { normalizeDegrees, toDegrees, toRadians } from "../utils/math.js";

const J2000 = 2451545.0;
const SCHLYTER_EPOCH = 2451543.5;

export function computeSky(date, location) {
  const observer = {
    latitude: location.latitude,
    longitude: location.longitude
  };

  const stars = STARS.map((star) => {
    const raDeg = star.raHours * 15;
    const horizontal = equatorialToHorizontal(raDeg, star.decDeg, date, observer);
    return {
      ...star,
      category: "star",
      raDeg,
      decDeg: star.decDeg,
      ...horizontal
    };
  });

  const solarSystem = computeSolarSystem(date).map((body) => {
    const info = SOLAR_SYSTEM_OBJECTS[body.id];
    const horizontal = equatorialToHorizontal(body.raDeg, body.decDeg, date, observer);
    return {
      ...info,
      ...body,
      category: body.id === "sun" || body.id === "moon" ? body.id : "planet",
      ...horizontal,
      distance: body.distance || info.distance,
      facts: body.phase ? [...info.facts, body.phase] : info.facts
    };
  });

  return {
    objects: [...stars, ...solarSystem],
    constellations: CONSTELLATIONS
  };
}

export function equatorialToHorizontal(raDeg, decDeg, date, observer) {
  const lat = toRadians(observer.latitude);
  const dec = toRadians(decDeg);
  const hourAngle = toRadians(normalizeDegrees(localSiderealTime(date, observer.longitude) - raDeg));

  const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(hourAngle);
  const alt = Math.asin(sinAlt);
  const cosAlt = Math.max(0.000001, Math.cos(alt));
  const cosAz = (Math.sin(dec) - Math.sin(alt) * Math.sin(lat)) / (cosAlt * Math.cos(lat));
  const sinAz = (-Math.cos(dec) * Math.sin(hourAngle)) / cosAlt;
  const az = Math.atan2(sinAz, cosAz);

  return {
    alt: toDegrees(alt),
    az: normalizeDegrees(toDegrees(az))
  };
}

export function julianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

export function localSiderealTime(date, longitude) {
  const jd = julianDate(date);
  const t = (jd - J2000) / 36525;
  const gmst =
    280.46061837 +
    360.98564736629 * (jd - J2000) +
    0.000387933 * t * t -
    (t * t * t) / 38710000;

  return normalizeDegrees(gmst + longitude);
}

function computeSolarSystem(date) {
  const jd = julianDate(date);
  const days = jd - SCHLYTER_EPOCH;
  const earth = heliocentricPosition("earth", days);
  const sunVector = {
    x: -earth.x,
    y: -earth.y,
    z: -earth.z
  };
  const sun = {
    id: "sun",
    ...eclipticVectorToEquatorial(sunVector, days),
    distance: `${earth.r.toFixed(2)} UA`
  };

  const moon = computeMoon(days);
  const planetIds = ["mercury", "venus", "mars", "jupiter", "saturn"];
  const planets = planetIds.map((id) => {
    const planet = heliocentricPosition(id, days);
    const geo = {
      x: planet.x - earth.x,
      y: planet.y - earth.y,
      z: planet.z - earth.z
    };
    const distance = Math.sqrt(geo.x * geo.x + geo.y * geo.y + geo.z * geo.z);
    return {
      id,
      ...eclipticVectorToEquatorial(geo, days),
      distance: `${distance.toFixed(2)} UA`
    };
  });

  return [sun, moon, ...planets];
}

function computeMoon(days) {
  const elements = {
    N: 125.1228 - 0.0529538083 * days,
    i: 5.1454,
    w: 318.0634 + 0.1643573223 * days,
    a: 60.2666,
    e: 0.0549,
    M: 115.3654 + 13.0649929509 * days
  };

  const position = orbitalPosition(elements);
  const equatorial = eclipticVectorToEquatorial(position, days);
  const distanceKm = position.r * 6378.14;

  return {
    id: "moon",
    ...equatorial,
    distance: `${Math.round(distanceKm).toLocaleString("fr-FR")} km`,
    phase: "Phase calculee approximativement dans cette version MVP."
  };
}

function heliocentricPosition(id, days) {
  return orbitalPosition(planetElements(id, days));
}

function orbitalPosition(elements) {
  const N = toRadians(normalizeDegrees(elements.N));
  const i = toRadians(elements.i);
  const w = toRadians(normalizeDegrees(elements.w));
  const a = elements.a;
  const e = elements.e;
  const M = toRadians(normalizeDegrees(elements.M));
  const E = solveKepler(M, e);
  const xv = a * (Math.cos(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const v = Math.atan2(yv, xv);
  const r = Math.sqrt(xv * xv + yv * yv);
  const vw = v + w;

  const x = r * (Math.cos(N) * Math.cos(vw) - Math.sin(N) * Math.sin(vw) * Math.cos(i));
  const y = r * (Math.sin(N) * Math.cos(vw) + Math.cos(N) * Math.sin(vw) * Math.cos(i));
  const z = r * (Math.sin(vw) * Math.sin(i));

  return { x, y, z, r };
}

function solveKepler(meanAnomaly, eccentricity) {
  let eccentricAnomaly = meanAnomaly + eccentricity * Math.sin(meanAnomaly) * (1 + eccentricity * Math.cos(meanAnomaly));

  for (let index = 0; index < 6; index += 1) {
    eccentricAnomaly -=
      (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly) /
      (1 - eccentricity * Math.cos(eccentricAnomaly));
  }

  return eccentricAnomaly;
}

function eclipticVectorToEquatorial(vector, days) {
  const obliquity = toRadians(23.4393 - 3.563e-7 * days);
  const x = vector.x;
  const y = vector.y * Math.cos(obliquity) - vector.z * Math.sin(obliquity);
  const z = vector.y * Math.sin(obliquity) + vector.z * Math.cos(obliquity);
  const raDeg = normalizeDegrees(toDegrees(Math.atan2(y, x)));
  const decDeg = toDegrees(Math.atan2(z, Math.sqrt(x * x + y * y)));

  return { raDeg, decDeg };
}

function planetElements(id, d) {
  const elements = {
    mercury: {
      N: 48.3313 + 3.24587e-5 * d,
      i: 7.0047 + 5.0e-8 * d,
      w: 29.1241 + 1.01444e-5 * d,
      a: 0.387098,
      e: 0.205635 + 5.59e-10 * d,
      M: 168.6562 + 4.0923344368 * d
    },
    venus: {
      N: 76.6799 + 2.4659e-5 * d,
      i: 3.3946 + 2.75e-8 * d,
      w: 54.891 + 1.38374e-5 * d,
      a: 0.72333,
      e: 0.006773 - 1.302e-9 * d,
      M: 48.0052 + 1.6021302244 * d
    },
    earth: {
      N: 0,
      i: 0,
      w: 282.9404 + 4.70935e-5 * d,
      a: 1,
      e: 0.016709 - 1.151e-9 * d,
      M: 356.047 + 0.9856002585 * d
    },
    mars: {
      N: 49.5574 + 2.11081e-5 * d,
      i: 1.8497 - 1.78e-8 * d,
      w: 286.5016 + 2.92961e-5 * d,
      a: 1.523688,
      e: 0.093405 + 2.516e-9 * d,
      M: 18.6021 + 0.5240207766 * d
    },
    jupiter: {
      N: 100.4542 + 2.76854e-5 * d,
      i: 1.303 - 1.557e-7 * d,
      w: 273.8777 + 1.64505e-5 * d,
      a: 5.20256,
      e: 0.048498 + 4.469e-9 * d,
      M: 19.895 + 0.0830853001 * d
    },
    saturn: {
      N: 113.6634 + 2.3898e-5 * d,
      i: 2.4886 - 1.081e-7 * d,
      w: 339.3939 + 2.97661e-5 * d,
      a: 9.55475,
      e: 0.055546 - 9.499e-9 * d,
      M: 316.967 + 0.0334442282 * d
    }
  };

  return elements[id];
}

// This MVP uses local, low-precision formulae to avoid a backend and paid APIs.
// Replace computeSolarSystem/equatorialToHorizontal later with astronomy-engine,
// a richer star catalog, or a VSOP87 based implementation while keeping the
// renderer contract: objects with { id, name, alt, az, magnitude, ...info }.
