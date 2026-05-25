import { normalizeDegrees, toDegrees, toRadians } from "../utils/math.js";

const WGS84_A = 6378137;
const WGS84_E2 = 6.69437999014e-3;

export function geodeticTargetToHorizontal(observer, target) {
  const observerEcef = geodeticToEcef(observer.latitude, observer.longitude, observer.altitude || 0);
  const targetEcef = geodeticToEcef(target.latitude, target.longitude, target.altitude || 0);
  const dx = targetEcef.x - observerEcef.x;
  const dy = targetEcef.y - observerEcef.y;
  const dz = targetEcef.z - observerEcef.z;
  const lat = toRadians(observer.latitude);
  const lon = toRadians(observer.longitude);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  const east = -sinLon * dx + cosLon * dy;
  const north = -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz;
  const up = cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz;
  const groundDistance = Math.hypot(east, north);
  const slantDistance = Math.hypot(groundDistance, up);

  return {
    az: normalizeDegrees(toDegrees(Math.atan2(east, north))),
    alt: toDegrees(Math.atan2(up, groundDistance)),
    groundDistanceMeters: groundDistance,
    slantDistanceMeters: slantDistance
  };
}

function geodeticToEcef(latitude, longitude, altitudeMeters) {
  const lat = toRadians(latitude);
  const lon = toRadians(longitude);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const normal = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);

  return {
    x: (normal + altitudeMeters) * cosLat * Math.cos(lon),
    y: (normal + altitudeMeters) * cosLat * Math.sin(lon),
    z: (normal * (1 - WGS84_E2) + altitudeMeters) * sinLat
  };
}
