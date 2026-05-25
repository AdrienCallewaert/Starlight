export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

export function signedDeltaDegrees(value) {
  return ((value + 540) % 360) - 180;
}

export function toRadians(degrees) {
  return degrees * DEG_TO_RAD;
}

export function toDegrees(radians) {
  return radians * RAD_TO_DEG;
}

export function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
