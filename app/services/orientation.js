import { clamp, normalizeDegrees, signedDeltaDegrees, toDegrees, toRadians } from "../utils/math.js";

export class OrientationService extends EventTarget {
  constructor() {
    super();
    this.orientation = createDemoOrientation();
    this.rawOrientation = null;
    this.isDemo = true;
    this.hasSensorData = false;
    this.demoFrame = null;
    this.sensorTimeout = null;
    this.relativeFallbackTimeout = null;
    this.sourceMode = null;
    this.relativeReference = null;
    this.boundHandleAbsolute = (event) => this.handleOrientation(event, "absolute");
    this.boundHandleRelative = (event) => this.handleOrientation(event, "device");
  }

  start(permissionStatus = "granted") {
    if (permissionStatus !== "granted" || !("DeviceOrientationEvent" in window)) {
      this.startDemo();
      return;
    }

    window.addEventListener("deviceorientationabsolute", this.boundHandleAbsolute, true);

    this.relativeFallbackTimeout = window.setTimeout(() => {
      if (!this.hasSensorData) {
        window.addEventListener("deviceorientation", this.boundHandleRelative, true);
      }
    }, 700);

    this.sensorTimeout = window.setTimeout(() => {
      if (!this.hasSensorData) {
        this.startDemo();
      }
    }, 2200);
  }

  stop() {
    window.removeEventListener("deviceorientationabsolute", this.boundHandleAbsolute, true);
    window.removeEventListener("deviceorientation", this.boundHandleRelative, true);

    if (this.demoFrame !== null) {
      cancelAnimationFrame(this.demoFrame);
      this.demoFrame = null;
    }

    if (this.sensorTimeout !== null) {
      clearTimeout(this.sensorTimeout);
      this.sensorTimeout = null;
    }

    if (this.relativeFallbackTimeout !== null) {
      clearTimeout(this.relativeFallbackTimeout);
      this.relativeFallbackTimeout = null;
    }
  }

  handleOrientation(event, sourceHint) {
    const alpha = typeof event.alpha === "number" ? event.alpha : null;
    const beta = typeof event.beta === "number" ? event.beta : null;
    const gamma = typeof event.gamma === "number" ? event.gamma : null;
    const webkitHeading = typeof event.webkitCompassHeading === "number" ? event.webkitCompassHeading : null;
    const isAbsolute = sourceHint === "absolute" || event.absolute === true || webkitHeading !== null;

    if (alpha === null && webkitHeading === null) {
      return;
    }

    if (this.sourceMode === "absolute" && !isAbsolute) {
      return;
    }

    if (isAbsolute && this.sourceMode !== "absolute") {
      this.sourceMode = "absolute";
      window.removeEventListener("deviceorientation", this.boundHandleRelative, true);
    } else if (this.sourceMode === null || this.sourceMode === "demo") {
      this.sourceMode = "device";
    }

    this.hasSensorData = true;
    this.isDemo = false;

    if (this.demoFrame !== null) {
      cancelAnimationFrame(this.demoFrame);
      this.demoFrame = null;
    }

    const nextOrientation =
      beta === null || gamma === null
        ? {
            heading: normalizeDegrees(webkitHeading ?? 360 - alpha),
            pitch: this.orientation.pitch,
            roll: this.orientation.roll,
            alpha,
            beta,
            gamma,
            source: this.sourceMode
          }
        : this.sourceMode === "absolute"
          ? deviceAnglesToCameraOrientation({
              alpha: webkitHeading === null ? alpha : normalizeDegrees(360 - webkitHeading),
              beta,
              gamma,
              screenAngle: getScreenAngle(),
              source: this.sourceMode
            })
          : this.deviceRelativeOrientation(alpha, beta, gamma);

    const shouldInitialize = this.rawOrientation === null;
    this.rawOrientation = nextOrientation;
    this.orientation = shouldInitialize
      ? nextOrientation
      : smoothOrientation(this.orientation, nextOrientation, nextOrientation.source === "relative" ? 0.34 : 0.42);

    this.dispatchEvent(new CustomEvent("change", { detail: this.orientation }));
  }

  deviceRelativeOrientation(alpha, beta, gamma) {
    const rawHeading = normalizeDegrees(360 - alpha);

    if (!this.relativeReference) {
      this.relativeReference = {
        rawHeading,
        heading: this.orientation.heading
      };
    }

    return {
      heading: normalizeDegrees(this.relativeReference.heading + signedDeltaDegrees(rawHeading - this.relativeReference.rawHeading)),
      pitch: clamp(90 - Math.abs(beta), -85, 85),
      roll: 0,
      alpha,
      beta,
      gamma,
      basis: null,
      source: "relative"
    };
  }

  startDemo() {
    this.isDemo = true;
    this.sourceMode = "demo";

    const animate = (time) => {
      const seconds = time / 1000;
      this.orientation = {
        heading: normalizeDegrees(205 + seconds * 4),
        pitch: 36 + Math.sin(seconds * 0.55) * 12,
        roll: 0,
        alpha: null,
        beta: null,
        gamma: null,
        source: "demo"
      };
      this.dispatchEvent(new CustomEvent("change", { detail: this.orientation }));
      this.demoFrame = requestAnimationFrame(animate);
    };

    if (this.demoFrame === null) {
      this.demoFrame = requestAnimationFrame(animate);
    }
  }
}

function smoothOrientation(current, next, factor) {
  if (current.basis && next.basis) {
    const basis = smoothBasis(current.basis, next.basis, factor);
    const angles = anglesFromForward(basis.forward);

    return {
      ...next,
      ...angles,
      basis
    };
  }

  return {
    ...next,
    heading: smoothAngle(current.heading, next.heading, factor),
    pitch: smoothNumber(current.pitch, next.pitch, factor),
    roll: smoothNumber(current.roll, next.roll, factor)
  };
}

function smoothAngle(current, next, factor) {
  const delta = ((next - current + 540) % 360) - 180;
  return normalizeDegrees(current + clamp(delta * factor, -14, 14));
}

function smoothNumber(current, next, factor) {
  return current + (next - current) * factor;
}

function deviceAnglesToCameraOrientation({ alpha, beta, gamma, screenAngle, source }) {
  const matrix = deviceRotationMatrix(alpha, beta, gamma);
  const xAxis = { east: matrix.m11, north: matrix.m21, up: matrix.m31 };
  const yAxis = { east: matrix.m12, north: matrix.m22, up: matrix.m32 };
  const zAxis = { east: matrix.m13, north: matrix.m23, up: matrix.m33 };
  const forward = normalize(toRenderVector({ east: -zAxis.east, north: -zAxis.north, up: -zAxis.up }));
  const screenRight = normalize(projectOnPlane(toRenderVector(screenRightEarthAxis(xAxis, yAxis, screenAngle)), forward));
  const rawBasis = orthonormalBasis(forward, screenRight);
  const rawAngles = anglesFromBasis(rawBasis);
  const angles = anglesFromForward(forward);
  const basis = fallbackBasisFromForward(forward, angles.heading);

  return {
    ...angles,
    rawRoll: rawAngles.roll,
    alpha,
    beta,
    gamma,
    basis,
    source
  };
}

function deviceRotationMatrix(alpha, beta, gamma) {
  const z = toRadians(alpha);
  const x = toRadians(beta);
  const y = toRadians(gamma);
  const cX = Math.cos(x);
  const cY = Math.cos(y);
  const cZ = Math.cos(z);
  const sX = Math.sin(x);
  const sY = Math.sin(y);
  const sZ = Math.sin(z);

  return {
    m11: cZ * cY - sZ * sX * sY,
    m12: -cX * sZ,
    m13: cY * sZ * sX + cZ * sY,
    m21: cY * sZ + cZ * sX * sY,
    m22: cZ * cX,
    m23: sZ * sY - cZ * cY * sX,
    m31: -cX * sY,
    m32: sX,
    m33: cX * cY
  };
}

function screenRightEarthAxis(xAxis, yAxis, screenAngle) {
  const angle = toRadians(normalizeDegrees(screenAngle));
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    east: xAxis.east * cos - yAxis.east * sin,
    north: xAxis.north * cos - yAxis.north * sin,
    up: xAxis.up * cos - yAxis.up * sin
  };
}

function getScreenAngle() {
  return screen.orientation?.angle ?? window.orientation ?? 0;
}

function toRenderVector(vector) {
  return {
    x: vector.east,
    y: vector.up,
    z: vector.north
  };
}

function orthonormalBasis(forward, preferredRight) {
  let right = normalize(projectOnPlane(preferredRight, forward));

  if (length(right) < 0.001) {
    right = normalize(cross({ x: 0, y: 1, z: 0 }, forward));
  }

  if (length(right) < 0.001) {
    right = { x: 1, y: 0, z: 0 };
  }

  return {
    forward: normalize(forward),
    right,
    up: normalize(cross(forward, right))
  };
}

function smoothBasis(current, next, factor) {
  const forward = normalize(lerpVector(current.forward, next.forward, factor));
  const heading = normalizeDegrees(toDegrees(Math.atan2(forward.x, forward.z)));

  return fallbackBasisFromForward(forward, heading);
}

function anglesFromBasis(basis) {
  const heading = normalizeDegrees(toDegrees(Math.atan2(basis.forward.x, basis.forward.z)));
  const pitch = toDegrees(Math.asin(clamp(basis.forward.y, -1, 1)));
  const unrolled = fallbackBasisFromForward(basis.forward, heading);
  const roll = toDegrees(Math.atan2(-dot(basis.up, unrolled.right), dot(basis.up, unrolled.up)));

  return {
    heading,
    pitch,
    roll
  };
}

function anglesFromForward(forward) {
  return {
    heading: normalizeDegrees(toDegrees(Math.atan2(forward.x, forward.z))),
    pitch: toDegrees(Math.asin(clamp(forward.y, -1, 1))),
    roll: 0
  };
}

function fallbackBasisFromForward(forward, heading) {
  let right = normalize(cross({ x: 0, y: 1, z: 0 }, forward));

  if (length(right) < 0.001) {
    const angle = toRadians(heading + 90);
    right = {
      x: Math.sin(angle),
      y: 0,
      z: Math.cos(angle)
    };
  }

  return {
    forward: normalize(forward),
    right,
    up: normalize(cross(forward, right))
  };
}

function lerpVector(current, next, factor) {
  return {
    x: current.x + (next.x - current.x) * factor,
    y: current.y + (next.y - current.y) * factor,
    z: current.z + (next.z - current.z) * factor
  };
}

function projectOnPlane(vector, normal) {
  const amount = dot(vector, normal);

  return {
    x: vector.x - normal.x * amount,
    y: vector.y - normal.y * amount,
    z: vector.z - normal.z * amount
  };
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

function createDemoOrientation() {
  return {
    heading: 205,
    pitch: 38,
    roll: 0,
    alpha: null,
    beta: null,
    gamma: null,
    source: "demo"
  };
}
