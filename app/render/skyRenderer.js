import { clamp, normalizeDegrees, signedDeltaDegrees, toRadians } from "../utils/math.js";

const DIRECTIONS = [
  { label: "N", az: 0 },
  { label: "NE", az: 45 },
  { label: "E", az: 90 },
  { label: "SE", az: 135 },
  { label: "S", az: 180 },
  { label: "SW", az: 225 },
  { label: "W", az: 270 },
  { label: "NW", az: 315 }
];

const HORIZON_ALTITUDE = 0;

export class SkyRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: true });
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.hitTargets = [];
    this.lastProjected = new Map();
    this.stats = createEmptyStats();
  }

  render({ sky, orientation, selectedId = null }) {
    this.resize();
    const ctx = this.ctx;

    ctx.clearRect(0, 0, this.width, this.height);
    this.hitTargets = [];
    this.lastProjected = new Map();
    this.stats = {
      totalObjects: sky.objects.length,
      aboveHorizon: sky.objects.filter((object) => isAboveHorizon(object)).length,
      projected: 0,
      horizonClip: true,
      sphereMode: renderMode(orientation)
    };

    this.drawCameraTint(ctx);
    this.drawCompass(ctx, orientation);
    this.drawAltitudeGuide(ctx, orientation);

    const projected = new Map();
    for (const object of sky.objects) {
      const point = this.project(object, orientation);
      if (point.visible) {
        projected.set(object.id, point);
        this.lastProjected.set(object.id, point);
      }
    }

    this.stats.projected = projected.size;

    this.drawConstellations(ctx, sky.constellations, projected);
    this.drawObjects(ctx, sky.objects, projected, selectedId);
    this.drawReticle(ctx);

    return this.stats;
  }

  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let closest = null;

    for (const target of this.hitTargets) {
      const distance = Math.hypot(target.x - x, target.y - y);
      if (distance <= target.radius && (!closest || distance < closest.distance)) {
        closest = { ...target, distance };
      }
    }

    return closest?.payload ?? null;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.round(rect.width));
    const nextHeight = Math.max(1, Math.round(rect.height));
    const nextDpr = Math.round(Math.min(2, window.devicePixelRatio || 1) * 100) / 100;

    if (nextWidth === this.width && nextHeight === this.height && nextDpr === this.dpr) {
      return;
    }

    this.width = nextWidth;
    this.height = nextHeight;
    this.dpr = nextDpr;
    this.canvas.width = Math.round(nextWidth * nextDpr);
    this.canvas.height = Math.round(nextHeight * nextDpr);
    this.ctx.setTransform(nextDpr, 0, 0, nextDpr, 0, 0);
  }

  project(object, orientation, options = {}) {
    const { horizonClip = true } = options;
    const metrics = this.projectionMetrics();
    const target = vectorFromAltAz(object.az, object.alt);
    const basis = cameraBasis(orientation);
    const cameraX = dot(target, basis.right);
    const cameraY = dot(target, basis.up);
    const cameraZ = dot(target, basis.forward);
    const x = metrics.centerX + (cameraX / Math.max(0.001, cameraZ)) * metrics.focalX;
    const y = metrics.centerY - (cameraY / Math.max(0.001, cameraZ)) * metrics.focalY;
    const azDelta = signedDeltaDegrees(object.az - orientation.heading);
    const altDelta = object.alt - orientation.pitch;
    const margin = 68;

    return {
      x,
      y,
      azDelta,
      altDelta,
      depth: cameraZ,
      visible:
        cameraZ > 0.04 &&
        (!horizonClip || isAboveHorizon(object)) &&
        x > -margin &&
        x < this.width + margin &&
        y > -margin &&
        y < this.height + margin
    };
  }

  screenToWorldVector(x, y, orientation) {
    const metrics = this.projectionMetrics();
    const basis = cameraBasis(orientation);
    const cameraX = (x - metrics.centerX) / metrics.focalX;
    const cameraY = -(y - metrics.centerY) / metrics.focalY;

    return normalize({
      x: basis.forward.x + basis.right.x * cameraX + basis.up.x * cameraY,
      y: basis.forward.y + basis.right.y * cameraX + basis.up.y * cameraY,
      z: basis.forward.z + basis.right.z * cameraX + basis.up.z * cameraY
    });
  }

  projectionMetrics() {
    const horizontalFov = this.width > this.height ? 82 : 66;
    const verticalFov = horizontalFov * (this.height / Math.max(1, this.width));

    return {
      centerX: this.width / 2,
      centerY: this.height / 2,
      focalX: (this.width / 2) / Math.tan(toRadians(horizontalFov / 2)),
      focalY: (this.height / 2) / Math.tan(toRadians(verticalFov / 2))
    };
  }

  drawCameraTint(ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, "rgba(3, 4, 8, 0.2)");
    gradient.addColorStop(0.58, "rgba(3, 4, 8, 0.04)");
    gradient.addColorStop(1, "rgba(3, 4, 8, 0.38)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  drawCompass(ctx, orientation) {
    const y = 88;

    ctx.save();
    ctx.font = "700 11px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const direction of DIRECTIONS) {
      const delta = signedDeltaDegrees(direction.az - orientation.heading);
      const x = this.width / 2 + (delta / 66) * this.width;

      if (x < -42 || x > this.width + 42) {
        continue;
      }

      const isCardinal = direction.label.length === 1;
      ctx.globalAlpha = isCardinal ? 0.92 : 0.56;
      ctx.strokeStyle = isCardinal ? "rgba(245, 217, 138, 0.72)" : "rgba(247, 248, 251, 0.28)";
      ctx.fillStyle = isCardinal ? "rgba(245, 217, 138, 0.95)" : "rgba(247, 248, 251, 0.74)";
      ctx.beginPath();
      ctx.moveTo(x, y - (isCardinal ? 18 : 13));
      ctx.lineTo(x, y - 5);
      ctx.stroke();
      ctx.fillText(direction.label, x, y + 10);
    }

    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(123, 223, 242, 0.88)";
    ctx.beginPath();
    ctx.moveTo(this.width / 2, y - 25);
    ctx.lineTo(this.width / 2, y - 4);
    ctx.stroke();
    ctx.restore();
  }

  drawAltitudeGuide(ctx, orientation) {
    const guideOrientation = horizonGuideOrientation(orientation);

    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = "700 10px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    this.drawHorizonGuide(ctx, guideOrientation);

    for (const altitude of [30, 60, 90]) {
      let started = false;
      let previousPoint = null;

      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.34)";
      ctx.setLineDash([4, 12]);
      ctx.beginPath();

      for (let offset = -132; offset <= 132; offset += 3) {
        const point = this.project(
          {
            az: normalizeDegrees(guideOrientation.heading + offset),
            alt: altitude
          },
          guideOrientation,
          { horizonClip: false }
        );

        if (!point.visible) {
          started = false;
          previousPoint = null;
          continue;
        }

        const jumped = previousPoint && Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y) > 96;

        if (!started || jumped) {
          ctx.moveTo(point.x, point.y);
          started = true;
        } else {
          ctx.lineTo(point.x, point.y);
        }

        previousPoint = point;
      }

      ctx.stroke();
      this.drawAltitudeLabel(ctx, guideOrientation, altitude);
    }

    ctx.setLineDash([]);
    ctx.restore();
  }

  drawHorizonGuide(ctx, orientation) {
    const basis = cameraBasis(orientation);
    const line = horizonLineInScreen(basis, this.projectionMetrics(), this.width, this.height);

    if (!line) {
      return;
    }

    ctx.globalAlpha = 0.56;
    ctx.strokeStyle = "rgba(245, 217, 138, 0.72)";
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(line.start.x, line.start.y);
    ctx.lineTo(line.end.x, line.end.y);
    ctx.stroke();

    if (line.label) {
      ctx.globalAlpha = 0.76;
      ctx.fillStyle = "rgba(245, 217, 138, 0.88)";
      ctx.fillText("HORIZON", line.label.x + 8, line.label.y - 8);
    }
  }

  drawAltitudeLabel(ctx, orientation, altitude) {
    const labelPoint = this.project(
      {
        az: normalizeDegrees(orientation.heading - 30),
        alt: altitude
      },
      orientation,
      { horizonClip: false }
    );

    if (!labelPoint.visible || labelPoint.x < 14 || labelPoint.x > this.width - 70) {
      return;
    }

    ctx.globalAlpha = altitude === 0 ? 0.72 : 0.5;
    ctx.fillStyle = altitude === 0 ? "rgba(245, 217, 138, 0.86)" : "rgba(247, 248, 251, 0.64)";
    ctx.fillText(altitude === 0 ? "HORIZON" : `${altitude} deg`, labelPoint.x + 8, labelPoint.y - 8);
  }

  drawConstellations(ctx, constellations, projected) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(123, 223, 242, 0.34)";
    ctx.fillStyle = "rgba(123, 223, 242, 0.78)";
    ctx.font = "700 10px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const constellation of constellations) {
      let visibleCount = 0;
      let labelX = 0;
      let labelY = 0;

      for (const [fromId, toId] of constellation.lines) {
        const from = projected.get(fromId);
        const to = projected.get(toId);

        if (!from || !to) {
          continue;
        }

        ctx.globalAlpha = 0.62;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }

      for (const starId of constellation.stars) {
        const point = projected.get(starId);
        if (!point) {
          continue;
        }

        visibleCount += 1;
        labelX += point.x;
        labelY += point.y;
      }

      if (visibleCount >= 2) {
        labelX /= visibleCount;
        labelY /= visibleCount;
        ctx.globalAlpha = 0.58;
        ctx.fillText(constellation.name.toUpperCase(), labelX, labelY - 20);
        this.hitTargets.push({
          x: labelX,
          y: labelY - 20,
          radius: 42,
          payload: constellation
        });
      }
    }

    ctx.restore();
  }

  drawObjects(ctx, objects, projected, selectedId) {
    ctx.save();

    for (const object of objects) {
      const point = projected.get(object.id);
      if (!point) {
        continue;
      }

      const selected = selectedId === object.id;
      this.drawObject(ctx, object, point, selected);
      this.hitTargets.push({
        x: point.x,
        y: point.y,
        radius: object.category === "star" ? 32 : 42,
        payload: object
      });
    }

    ctx.restore();
  }

  drawObject(ctx, object, point, selected) {
    const size = objectSize(object);
    const magnitude = typeof object.magnitude === "number" ? object.magnitude : 1;
    const alpha = object.category === "aircraft" ? 0.96 : clamp(1.08 - Math.max(-1.5, magnitude) * 0.12, 0.42, 1);
    const color = object.color || "#ffffff";

    ctx.save();
    ctx.globalAlpha = alpha;

    if (object.category === "aircraft") {
      this.drawAircraft(ctx, object, point, size, selected);
    } else if (object.category === "sun") {
      this.drawDisc(ctx, point, size + 7, color, "rgba(255, 196, 96, 0.22)");
    } else if (object.category === "moon") {
      this.drawDisc(ctx, point, size + 5, color, "rgba(255, 255, 255, 0.18)");
      ctx.fillStyle = "rgba(8, 10, 15, 0.24)";
      ctx.beginPath();
      ctx.arc(point.x + 4, point.y - 2, size + 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (object.category === "planet") {
      this.drawDisc(ctx, point, size + 3, color, "rgba(245, 217, 138, 0.18)");
      ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(point.x, point.y, size + 7, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.shadowColor = color;
      ctx.shadowBlur = selected ? 16 : 8;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    if (selected) {
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(123, 223, 242, 0.92)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(point.x, point.y, size + (object.category === "aircraft" ? 16 : 14), 0, Math.PI * 2);
      ctx.stroke();
    }

    if (shouldShowLabel(object, selected)) {
      this.drawLabel(ctx, object.name, point.x, point.y, size, selected);
    }

    ctx.restore();
  }

  drawDisc(ctx, point, radius, color, glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 24;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  drawAircraft(ctx, object, point, size, selected) {
    const rotation = toRadians(signedDeltaDegrees((object.track ?? object.az) - object.az) + 90);
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(rotation);
    ctx.shadowColor = "rgba(154, 240, 193, 0.7)";
    ctx.shadowBlur = selected ? 18 : 10;
    ctx.fillStyle = selected ? "rgba(154, 240, 193, 0.98)" : "rgba(154, 240, 193, 0.82)";
    ctx.beginPath();
    ctx.moveTo(size + 7, 0);
    ctx.lineTo(-size, -size * 0.78);
    ctx.lineTo(-size * 0.42, 0);
    ctx.lineTo(-size, size * 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(154, 240, 193, 0.42)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(point.x, point.y, size + 9, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawLabel(ctx, label, x, y, size, selected) {
    ctx.shadowBlur = 0;
    ctx.font = `${selected ? 800 : 700} 11px Inter, system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = selected ? "rgba(247, 248, 251, 0.98)" : "rgba(247, 248, 251, 0.78)";
    ctx.fillText(label, x + size + 8, y - size - 6);
  }

  drawReticle(ctx) {
    const x = this.width / 2;
    const y = this.height / 2;

    ctx.save();
    ctx.strokeStyle = "rgba(247, 248, 251, 0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(123, 223, 242, 0.52)";
    ctx.beginPath();
    ctx.moveTo(x - 32, y);
    ctx.lineTo(x - 22, y);
    ctx.moveTo(x + 22, y);
    ctx.lineTo(x + 32, y);
    ctx.moveTo(x, y - 32);
    ctx.lineTo(x, y - 22);
    ctx.moveTo(x, y + 22);
    ctx.lineTo(x, y + 32);
    ctx.stroke();
    ctx.restore();
  }
}

function createEmptyStats() {
  return {
    totalObjects: 0,
    aboveHorizon: 0,
    projected: 0,
    horizonClip: true,
    sphereMode: "alt-az"
  };
}

function isAboveHorizon(object) {
  return object.alt >= HORIZON_ALTITUDE;
}

function renderMode(orientation) {
  if (orientation.horizonBasis) {
    return "basis+roll";
  }

  return orientation.basis ? "basis-3d" : "alt-az";
}

function horizonGuideOrientation(orientation) {
  if (!orientation.horizonBasis) {
    return orientation;
  }

  return {
    ...orientation,
    basis: orientation.horizonBasis
  };
}

function horizonLineInScreen(basis, metrics, width, height) {
  const margin = 84;
  const coefficientA = basis.right.y / metrics.focalX;
  const coefficientB = -basis.up.y / metrics.focalY;
  const coefficientC =
    basis.forward.y -
    (basis.right.y * metrics.centerX) / metrics.focalX +
    (basis.up.y * metrics.centerY) / metrics.focalY;
  const points = lineRectIntersections(coefficientA, coefficientB, coefficientC, {
    minX: -margin,
    minY: -margin,
    maxX: width + margin,
    maxY: height + margin
  });

  if (points.length < 2) {
    return null;
  }

  const [start, end] = farthestPair(points);
  const label = horizonLabelPoint(coefficientA, coefficientB, coefficientC, start, end, width, height);

  return { start, end, label };
}

function lineRectIntersections(coefficientA, coefficientB, coefficientC, rect) {
  const points = [];
  const epsilon = 0.000001;

  if (Math.abs(coefficientB) > epsilon) {
    pushUniquePoint(points, {
      x: rect.minX,
      y: -(coefficientA * rect.minX + coefficientC) / coefficientB
    });
    pushUniquePoint(points, {
      x: rect.maxX,
      y: -(coefficientA * rect.maxX + coefficientC) / coefficientB
    });
  }

  if (Math.abs(coefficientA) > epsilon) {
    pushUniquePoint(points, {
      x: -(coefficientB * rect.minY + coefficientC) / coefficientA,
      y: rect.minY
    });
    pushUniquePoint(points, {
      x: -(coefficientB * rect.maxY + coefficientC) / coefficientA,
      y: rect.maxY
    });
  }

  return points.filter(
    (point) =>
      point.x >= rect.minX - 0.5 &&
      point.x <= rect.maxX + 0.5 &&
      point.y >= rect.minY - 0.5 &&
      point.y <= rect.maxY + 0.5
  );
}

function pushUniquePoint(points, point) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return;
  }

  if (!points.some((current) => Math.hypot(current.x - point.x, current.y - point.y) < 0.5)) {
    points.push(point);
  }
}

function farthestPair(points) {
  let best = [points[0], points[1]];
  let bestDistance = -1;

  for (let index = 0; index < points.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < points.length; nextIndex += 1) {
      const distance = Math.hypot(points[index].x - points[nextIndex].x, points[index].y - points[nextIndex].y);
      if (distance > bestDistance) {
        bestDistance = distance;
        best = [points[index], points[nextIndex]];
      }
    }
  }

  return best;
}

function horizonLabelPoint(coefficientA, coefficientB, coefficientC, start, end, width, height) {
  let x = clamp(width * 0.12, 14, width - 92);
  let y = Math.abs(coefficientB) > 0.000001 ? -(coefficientA * x + coefficientC) / coefficientB : null;

  if (y === null || y < 16 || y > height - 16) {
    x = (start.x + end.x) / 2;
    y = (start.y + end.y) / 2;
  }

  if (x < 14 || x > width - 92 || y < 16 || y > height - 16) {
    return null;
  }

  return { x, y };
}

function objectSize(object) {
  if (object.category === "aircraft") {
    return 8;
  }

  if (object.category === "sun") {
    return 7;
  }

  if (object.category === "moon") {
    return 8;
  }

  if (object.category === "planet") {
    return clamp(7 - object.magnitude, 4, 10);
  }

  return clamp(4.6 - object.magnitude * 0.78, 1.4, 5.8);
}

function shouldShowLabel(object, selected) {
  if (
    selected ||
    object.category === "sun" ||
    object.category === "moon" ||
    object.category === "planet" ||
    object.category === "aircraft"
  ) {
    return true;
  }

  return object.magnitude <= 1.35;
}

function vectorFromAltAz(az, alt) {
  const azRad = toRadians(az);
  const altRad = toRadians(alt);
  const cosAlt = Math.cos(altRad);

  return {
    x: cosAlt * Math.sin(azRad),
    y: Math.sin(altRad),
    z: cosAlt * Math.cos(azRad)
  };
}

function cameraBasis(orientation) {
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
