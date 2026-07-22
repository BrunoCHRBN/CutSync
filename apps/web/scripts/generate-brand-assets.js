const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUT = path.resolve(__dirname, '..', 'assets', 'images');
const COLORS = {
  forest: [44, 67, 52, 255],
  sand: [218, 210, 182, 255],
  softSand: [240, 236, 224, 255],
  white: [255, 255, 255, 255],
  transparent: [0, 0, 0, 0],
};

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    rows[rowOffset] = 0;
    pixels.copy(rows, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function paintScissors(buffer, size, symbol, cutout, scale = 1) {
  const pixel = (x, y, color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const offset = (Math.floor(y) * size + Math.floor(x)) * 4;
    buffer[offset] = color[0];
    buffer[offset + 1] = color[1];
    buffer[offset + 2] = color[2];
    buffer[offset + 3] = color[3];
  };
  const circle = (cx, cy, radius, color) => {
    const minX = Math.floor(cx - radius);
    const maxX = Math.ceil(cx + radius);
    const minY = Math.floor(cy - radius);
    const maxY = Math.ceil(cy + radius);
    for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= radius) pixel(x, y, color);
    }
  };
  const capsule = (ax, ay, bx, by, radius, color) => {
    const minX = Math.floor(Math.min(ax, bx) - radius);
    const maxX = Math.ceil(Math.max(ax, bx) + radius);
    const minY = Math.floor(Math.min(ay, by) - radius);
    const maxY = Math.ceil(Math.max(ay, by) + radius);
    for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
      if (distanceToSegment(x + 0.5, y + 0.5, ax, ay, bx, by) <= radius) pixel(x, y, color);
    }
  };

  const n = (value) => value * size * scale + size * (1 - scale) / 2;
  const radius = (value) => value * size * scale;
  const pivotX = n(0.5);
  const pivotY = n(0.49);
  const leftHandle = [n(0.35), n(0.68)];
  const rightHandle = [n(0.65), n(0.68)];

  capsule(leftHandle[0], leftHandle[1], pivotX, pivotY, radius(0.046), symbol);
  capsule(rightHandle[0], rightHandle[1], pivotX, pivotY, radius(0.046), symbol);
  capsule(pivotX, pivotY, n(0.76), n(0.23), radius(0.04), symbol);
  capsule(pivotX, pivotY, n(0.24), n(0.23), radius(0.04), symbol);
  circle(leftHandle[0], leftHandle[1], radius(0.112), symbol);
  circle(rightHandle[0], rightHandle[1], radius(0.112), symbol);
  circle(leftHandle[0], leftHandle[1], radius(0.055), cutout);
  circle(rightHandle[0], rightHandle[1], radius(0.055), cutout);
  circle(pivotX, pivotY, radius(0.046), symbol);
  circle(pivotX, pivotY, radius(0.017), cutout);
}

function render(size, { background, symbol, cutout = background, circleBackground = false, symbolScale = 1 }) {
  const supersampling = size <= 128 ? 4 : 3;
  const highSize = size * supersampling;
  const high = Buffer.alloc(highSize * highSize * 4);
  const fill = circleBackground ? COLORS.transparent : background;
  for (let index = 0; index < high.length; index += 4) {
    high[index] = fill[0]; high[index + 1] = fill[1]; high[index + 2] = fill[2]; high[index + 3] = fill[3];
  }
  if (circleBackground) {
    const center = highSize / 2;
    const radius = highSize * 0.49;
    for (let y = 0; y < highSize; y += 1) for (let x = 0; x < highSize; x += 1) {
      if (Math.hypot(x + 0.5 - center, y + 0.5 - center) <= radius) {
        const offset = (y * highSize + x) * 4;
        high[offset] = background[0]; high[offset + 1] = background[1]; high[offset + 2] = background[2]; high[offset + 3] = background[3];
      }
    }
  }
  paintScissors(high, highSize, symbol, circleBackground ? background : cutout, symbolScale);

  const output = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    let alpha = 0; let red = 0; let green = 0; let blue = 0;
    for (let sy = 0; sy < supersampling; sy += 1) for (let sx = 0; sx < supersampling; sx += 1) {
      const offset = (((y * supersampling + sy) * highSize) + x * supersampling + sx) * 4;
      const a = high[offset + 3] / 255;
      alpha += a; red += high[offset] * a; green += high[offset + 1] * a; blue += high[offset + 2] * a;
    }
    const count = supersampling * supersampling;
    const out = (y * size + x) * 4;
    output[out + 3] = Math.round(alpha / count * 255);
    if (alpha > 0) {
      output[out] = Math.round(red / alpha);
      output[out + 1] = Math.round(green / alpha);
      output[out + 2] = Math.round(blue / alpha);
    }
  }
  return encodePng(size, size, output);
}

const assets = [
  ['icon.png', 1024, { background: COLORS.forest, symbol: COLORS.sand }],
  ['favicon.png', 64, { background: COLORS.forest, symbol: COLORS.sand, circleBackground: true, symbolScale: 0.86 }],
  ['splash-icon.png', 256, { background: COLORS.transparent, symbol: COLORS.forest, cutout: COLORS.transparent, symbolScale: 0.82 }],
  ['android-icon-foreground.png', 432, { background: COLORS.transparent, symbol: COLORS.forest, cutout: COLORS.transparent, symbolScale: 0.72 }],
  ['android-icon-background.png', 432, { background: COLORS.sand, symbol: COLORS.sand, cutout: COLORS.sand, symbolScale: 0 }],
  ['android-icon-monochrome.png', 432, { background: COLORS.transparent, symbol: COLORS.white, cutout: COLORS.transparent, symbolScale: 0.72 }],
];

for (const [name, size, options] of assets) {
  fs.writeFileSync(path.join(OUT, name), render(size, options));
}

console.log(`Generated ${assets.length} CutSync brand assets in ${OUT}`);
