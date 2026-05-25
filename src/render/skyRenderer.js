import { clamp, signedDeltaDegrees, toRadians } from "../utils/math.js";

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

export class SkyRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: true });
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.hitTargets = [];
    this.lastProjected = new Map();
  }

  render({ sky, orientation, selectedId = null }) {
    this.resize();
    const ctx = this.ctx;

    ctx.clearRect(0, 0, this.width, this.height);
    this.hitTargets = [];
    this.lastProjected = new Map();

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

    this.drawConstellations(ctx, sky.constellations, projected);
    this.drawObjects(ctx, sky.objects, projected, selectedId);
    this.drawReticle(ctx);
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
    const nextWidth = Math.max(1, rect.width);
    const nextHeight = Math.max(1, rect.height);
    const nextDpr = Math.min(2, window.devicePixelRatio || 1);

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

  project(object, orientation) {
    const horizontalFov = this.width > this.height ? 82 : 66;
    const verticalFov = horizontalFov * (this.height / Math.max(1, this.width));
    const azDelta = signedDeltaDegrees(object.az - orientation.heading);
    const altDelta = object.alt - orientation.pitch;
    const baseX = this.width / 2 + (azDelta / horizontalFov) * this.width;
    const baseY = this.height / 2 - (altDelta / verticalFov) * this.height;
    const roll = toRadians(-orientation.roll || 0);
    const centeredX = baseX - this.width / 2;
    const centeredY = baseY - this.height / 2;
    const x = this.width / 2 + centeredX * Math.cos(roll) - centeredY * Math.sin(roll);
    const y = this.height / 2 + centeredX * Math.sin(roll) + centeredY * Math.cos(roll);
    const margin = 68;

    return {
      x,
      y,
      azDelta,
      altDelta,
      visible:
        object.alt > -14 &&
        x > -margin &&
        x < this.width + margin &&
        y > -margin &&
        y < this.height + margin
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
    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.34)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 10]);

    const labels = [-30, 0, 30, 60, 90];
    const horizontalFov = this.width > this.height ? 82 : 66;
    const verticalFov = horizontalFov * (this.height / Math.max(1, this.width));

    for (const altitude of labels) {
      const y = this.height / 2 - ((altitude - orientation.pitch) / verticalFov) * this.height;
      if (y < 110 || y > this.height - 80) {
        continue;
      }

      ctx.beginPath();
      ctx.moveTo(18, y);
      ctx.lineTo(this.width - 18, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(247, 248, 251, 0.62)";
      ctx.font = "700 10px Inter, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${altitude} deg`, 22, y - 7);
    }

    ctx.restore();
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
    const alpha = clamp(1.08 - Math.max(-1.5, object.magnitude) * 0.12, 0.42, 1);
    const color = object.color || "#ffffff";

    ctx.save();
    ctx.globalAlpha = alpha;

    if (object.category === "sun") {
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
      ctx.arc(point.x, point.y, size + 14, 0, Math.PI * 2);
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

function objectSize(object) {
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
  if (selected || object.category === "sun" || object.category === "moon" || object.category === "planet") {
    return true;
  }

  return object.magnitude <= 1.35;
}
