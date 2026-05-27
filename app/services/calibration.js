import { clamp, normalizeDegrees, toDegrees, toRadians } from "../utils/math.js";

const MIN_REFERENCE_ALTITUDE = 5;
const STAR_REFERENCE_MAGNITUDE = 1.6;

export function createEmptyCalibration() {
  return {
    active: false,
    referenceId: null,
    referenceName: null,
    errorDeg: 0,
    rotation: null,
    calibratedAt: null
  };
}

export function referenceCandidates(objects, limit = 8) {
  return objects
    .filter(isReferenceCandidate)
    .sort((a, b) => referenceScore(a) - referenceScore(b))
    .slice(0, limit);
}

export function autoReferenceCandidates(objects, limit = 12) {
  return objects
    .filter((object) => object.category === "sun" || isReferenceCandidate(object))
    .filter((object) => Number.isFinite(object.alt) && object.alt >= MIN_REFERENCE_ALTITUDE)
    .sort((a, b) => referenceScore(a) - referenceScore(b))
    .slice(0, limit);
}

export function createCalibration(reference, orientation) {
  const basis = basisFromOrientation(orientation);

  return createCalibrationFromVector(reference, basis.forward);
}

export function createCalibrationFromVector(reference, observedVector) {
  const target = vectorFromAltAz(reference.az, reference.alt);
  const rotation = rotationBetweenVectors(observedVector, target);

  return {
    active: true,
    referenceId: reference.id,
    referenceName: reference.name,
    errorDeg: toDegrees(rotation.angle),
    rotation,
    calibratedAt: Date.now()
  };
}

export function applyCalibration(orientation, calibration) {
  if (!calibration?.active || !calibration.rotation) {
    return orientation;
  }

  const basis = rotateBasis(basisFromOrientation(orientation), calibration.rotation);
  const horizonBasis = orientation.horizonBasis ? rotateBasis(orientation.horizonBasis, calibration.rotation) : null;
  const angles = anglesFromForward(basis.forward);

  return {
    ...orientation,
    ...angles,
    basis,
    horizonBasis,
    calibrationReference: calibration.referenceName,
    calibrationError: calibration.errorDeg
  };
}

export function calibrationLabel(calibration) {
  if (!calibration?.active) {
    return "off";
  }

  return `${calibration.referenceName} ${calibration.errorDeg.toFixed(1)} deg`;
}

function isReferenceCandidate(object) {
  if (!Number.isFinite(object.alt) || object.alt < MIN_REFERENCE_ALTITUDE) {
    return false;
  }

  if (object.category === "moon") {
    return true;
  }

  if (object.category === "planet") {
    return true;
  }

  return object.category === "star" && typeof object.magnitude === "number" && object.magnitude <= STAR_REFERENCE_MAGNITUDE;
}

function referenceScore(object) {
  const magnitude = typeof object.magnitude === "number" ? object.magnitude : 2;
  const altitudePenalty = Math.abs(object.alt - 45) * 0.015;

  if (object.category === "moon") {
    return -120 + altitudePenalty;
  }

  if (object.category === "sun") {
    return -100 + altitudePenalty;
  }

  if (object.category === "planet") {
    return -60 + magnitude + altitudePenalty;
  }

  return magnitude + altitudePenalty;
}

function basisFromOrientation(orientation) {
  if (orientation.basis?.forward && orientation.basis?.right && orientation.basis?.up) {
    return orientation.basis;
  }

  const forward = vectorFromAltAz(orientation.heading, orientation.pitch);
  const worldUp = { x: 0, y: 1, z: 0 };
  let right = normalize(cross(worldUp, forward));

  if (length(right) < 0.001) {
    right = vectorFromAltAz(orientation.heading + 90, 0);
  }

  let up = normalize(cross(forward, right));
  const roll = toRadians(orientation.roll || 0);
  const cosRoll = Math.cos(roll);
  const sinRoll = Math.sin(roll);
  const rolledRight = {
    x: right.x * cosRoll + up.x * sinRoll,
    y: right.y * cosRoll + up.y * sinRoll,
    z: right.z * cosRoll + up.z * sinRoll
  };
  const rolledUp = {
    x: up.x * cosRoll - right.x * sinRoll,
    y: up.y * cosRoll - right.y * sinRoll,
    z: up.z * cosRoll - right.z * sinRoll
  };

  return {
    forward: normalize(forward),
    right: normalize(rolledRight),
    up: normalize(rolledUp)
  };
}

function rotateBasis(basis, rotation) {
  return {
    forward: normalize(rotateVector(basis.forward, rotation)),
    right: normalize(rotateVector(basis.right, rotation)),
    up: normalize(rotateVector(basis.up, rotation))
  };
}

function rotationBetweenVectors(from, to) {
  const source = normalize(from);
  const target = normalize(to);
  const axis = cross(source, target);
  const axisLength = length(axis);
  const dotProduct = clamp(dot(source, target), -1, 1);

  if (axisLength < 0.000001) {
    if (dotProduct > 0) {
      return { axis: { x: 0, y: 1, z: 0 }, angle: 0 };
    }

    return {
      axis: perpendicularAxis(source),
      angle: Math.PI
    };
  }

  return {
    axis: normalize(axis),
    angle: Math.atan2(axisLength, dotProduct)
  };
}

function rotateVector(vector, rotation) {
  if (!rotation || Math.abs(rotation.angle) < 0.000001) {
    return vector;
  }

  const axis = rotation.axis;
  const cos = Math.cos(rotation.angle);
  const sin = Math.sin(rotation.angle);
  const amount = dot(axis, vector) * (1 - cos);

  return {
    x: vector.x * cos + (axis.y * vector.z - axis.z * vector.y) * sin + axis.x * amount,
    y: vector.y * cos + (axis.z * vector.x - axis.x * vector.z) * sin + axis.y * amount,
    z: vector.z * cos + (axis.x * vector.y - axis.y * vector.x) * sin + axis.z * amount
  };
}

function vectorFromAltAz(az, alt) {
  const azRad = toRadians(normalizeDegrees(az));
  const altRad = toRadians(alt);
  const cosAlt = Math.cos(altRad);

  return {
    x: cosAlt * Math.sin(azRad),
    y: Math.sin(altRad),
    z: cosAlt * Math.cos(azRad)
  };
}

function anglesFromForward(forward) {
  return {
    heading: normalizeDegrees(toDegrees(Math.atan2(forward.x, forward.z))),
    pitch: toDegrees(Math.asin(clamp(forward.y, -1, 1))),
    roll: 0
  };
}

function perpendicularAxis(vector) {
  const axis = Math.abs(vector.y) < 0.9 ? cross(vector, { x: 0, y: 1, z: 0 }) : cross(vector, { x: 1, y: 0, z: 0 });

  return normalize(axis);
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function length(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalize(vector) {
  const size = length(vector);

  if (size < 0.000001) {
    return { x: 0, y: 0, z: 0 };
  }

  return {
    x: vector.x / size,
    y: vector.y / size,
    z: vector.z / size
  };
}
