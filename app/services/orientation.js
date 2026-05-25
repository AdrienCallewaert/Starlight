import { clamp, normalizeDegrees } from "../utils/math.js";

export class OrientationService extends EventTarget {
  constructor() {
    super();
    this.orientation = createDemoOrientation();
    this.rawOrientation = null;
    this.isDemo = true;
    this.hasSensorData = false;
    this.demoFrame = null;
    this.sensorTimeout = null;
    this.boundHandleOrientation = this.handleOrientation.bind(this);
  }

  start(permissionStatus = "granted") {
    if (permissionStatus !== "granted" || !("DeviceOrientationEvent" in window)) {
      this.startDemo();
      return;
    }

    window.addEventListener("deviceorientationabsolute", this.boundHandleOrientation, true);
    window.addEventListener("deviceorientation", this.boundHandleOrientation, true);

    this.sensorTimeout = window.setTimeout(() => {
      if (!this.hasSensorData) {
        this.startDemo();
      }
    }, 1400);
  }

  stop() {
    window.removeEventListener("deviceorientationabsolute", this.boundHandleOrientation, true);
    window.removeEventListener("deviceorientation", this.boundHandleOrientation, true);

    if (this.demoFrame !== null) {
      cancelAnimationFrame(this.demoFrame);
      this.demoFrame = null;
    }

    if (this.sensorTimeout !== null) {
      clearTimeout(this.sensorTimeout);
      this.sensorTimeout = null;
    }
  }

  handleOrientation(event) {
    const alpha = typeof event.alpha === "number" ? event.alpha : null;
    const beta = typeof event.beta === "number" ? event.beta : null;
    const gamma = typeof event.gamma === "number" ? event.gamma : null;
    const webkitHeading = typeof event.webkitCompassHeading === "number" ? event.webkitCompassHeading : null;

    if (alpha === null && webkitHeading === null) {
      return;
    }

    this.hasSensorData = true;
    this.isDemo = false;

    if (this.demoFrame !== null) {
      cancelAnimationFrame(this.demoFrame);
      this.demoFrame = null;
    }

    const nextOrientation = {
      heading: normalizeDegrees(webkitHeading ?? 360 - alpha),
      pitch: beta === null ? this.orientation.pitch : clamp(90 - Math.abs(beta), -20, 95),
      roll: gamma === null ? 0 : clamp(gamma, -90, 90),
      alpha,
      beta,
      gamma,
      source: event.absolute ? "absolute" : "device"
    };

    const shouldInitialize = this.rawOrientation === null;
    this.rawOrientation = nextOrientation;
    this.orientation = shouldInitialize ? nextOrientation : smoothOrientation(this.orientation, nextOrientation, 0.22);

    this.dispatchEvent(new CustomEvent("change", { detail: this.orientation }));
  }

  startDemo() {
    this.isDemo = true;

    const animate = (time) => {
      const seconds = time / 1000;
      this.orientation = {
        heading: normalizeDegrees(205 + seconds * 4),
        pitch: 36 + Math.sin(seconds * 0.55) * 12,
        roll: Math.sin(seconds * 0.8) * 5,
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
  return {
    ...next,
    heading: smoothAngle(current.heading, next.heading, factor),
    pitch: smoothNumber(current.pitch, next.pitch, factor),
    roll: smoothNumber(current.roll, next.roll, factor)
  };
}

function smoothAngle(current, next, factor) {
  const delta = ((next - current + 540) % 360) - 180;
  return normalizeDegrees(current + delta * factor);
}

function smoothNumber(current, next, factor) {
  return current + (next - current) * factor;
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
