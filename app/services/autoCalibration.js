const SAMPLE_WIDTH = 160;
const MIN_LUMINANCE = 198;
const MIN_PIXELS = 10;

let sampleCanvas = null;
let sampleCtx = null;

export function detectBrightSpot(video, displayWidth, displayHeight) {
  if (!video.videoWidth || !video.videoHeight || displayWidth <= 0 || displayHeight <= 0) {
    return null;
  }

  const width = SAMPLE_WIDTH;
  const height = Math.max(80, Math.round(width * (displayHeight / displayWidth)));
  const ctx = getSampleContext(width, height);
  const crop = coverCrop(video.videoWidth, video.videoHeight, width, height);

  ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);

  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const topLimit = Math.round(height * 0.18);
  const bottomLimit = Math.round(height * 0.93);
  let count = 0;
  let weightedX = 0;
  let weightedY = 0;
  let totalWeight = 0;
  let peak = 0;

  for (let y = topLimit; y < bottomLimit; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
      const score = luminance + saturation * 0.18;

      if (score < MIN_LUMINANCE) {
        continue;
      }

      const weight = (score - MIN_LUMINANCE) ** 1.35;
      count += 1;
      weightedX += x * weight;
      weightedY += y * weight;
      totalWeight += weight;
      peak = Math.max(peak, score);
    }
  }

  if (count < MIN_PIXELS || totalWeight <= 0) {
    return null;
  }

  return {
    x: (weightedX / totalWeight / width) * displayWidth,
    y: (weightedY / totalWeight / height) * displayHeight,
    confidence: Math.min(1, (peak - MIN_LUMINANCE) / 80) * Math.min(1, count / 420),
    pixels: count
  };
}

function getSampleContext(width, height) {
  if (!sampleCanvas) {
    sampleCanvas = document.createElement("canvas");
    sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  }

  if (sampleCanvas.width !== width || sampleCanvas.height !== height) {
    sampleCanvas.width = width;
    sampleCanvas.height = height;
  }

  return sampleCtx;
}

function coverCrop(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const sw = targetWidth / scale;
  const sh = targetHeight / scale;

  return {
    sx: Math.max(0, (sourceWidth - sw) / 2),
    sy: Math.max(0, (sourceHeight - sh) / 2),
    sw,
    sh
  };
}
