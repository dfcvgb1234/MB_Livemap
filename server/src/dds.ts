import { PNG } from "pngjs";

const DDS_MAGIC = 0x20534444;
const MAX_EDGE = 8192;

export type DecodedImage = {
  width: number;
  height: number;
  rgba: Uint8Array;
};

export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const png = new PNG({ width, height });
  if (!png.data || rgba.length !== png.data.length) {
    throw new Error("That DDS image could not be saved");
  }
  png.data.set(rgba);
  return PNG.sync.write(png);
}

export function decodeDds(input: Uint8Array): DecodedImage {
  if (input.byteLength < 128) throw new Error("That DDS file is incomplete");
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  if (view.getUint32(0, true) !== DDS_MAGIC) throw new Error("That file is not a DDS image");

  const height = view.getUint32(12, true);
  const width = view.getUint32(16, true);
  if (width < 1 || height < 1 || width > MAX_EDGE || height > MAX_EDGE) {
    throw new Error("That DDS image is too large");
  }

  const formatFlags = view.getUint32(80, true);
  const fourCc = fourCcAt(input, 84);
  const bitCount = view.getUint32(88, true);
  const pixels = input.subarray(128);

  if ((formatFlags & 0x4) !== 0) {
    if (fourCc === "DXT1") return { width, height, rgba: decodeBlocks(pixels, width, height, "dxt1") };
    if (fourCc === "DXT3") return { width, height, rgba: decodeBlocks(pixels, width, height, "dxt3") };
    if (fourCc === "DXT5") return { width, height, rgba: decodeBlocks(pixels, width, height, "dxt5") };
    throw new Error("That DDS format is not supported");
  }

  if ((formatFlags & 0x40) !== 0 && (bitCount === 24 || bitCount === 32)) {
    return {
      width,
      height,
      rgba: decodeUncompressed(input, view, pixels, width, height, bitCount),
    };
  }

  throw new Error("That DDS format is not supported");
}

function fourCcAt(input: Uint8Array, offset: number): string {
  let text = "";
  for (let i = 0; i < 4; i++) {
    const code = input[offset + i] ?? 0;
    if (code === 0) continue;
    text += String.fromCharCode(code);
  }
  return text;
}

function decodeBlocks(pixels: Uint8Array, width: number, height: number, format: "dxt1" | "dxt3" | "dxt5"): Uint8Array {
  const blocksX = Math.ceil(width / 4);
  const blocksY = Math.ceil(height / 4);
  const blockBytes = format === "dxt1" ? 8 : 16;
  if (pixels.byteLength < blocksX * blocksY * blockBytes) throw new Error("That DDS file is incomplete");

  const rgba = new Uint8Array(width * height * 4);
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const offset = (by * blocksX + bx) * blockBytes;
      const originX = bx * 4;
      const originY = by * 4;
      if (format === "dxt1") {
        const colors = colorTable(pixels, offset, false);
        writeColorBlock(rgba, width, height, originX, originY, pixels, offset + 4, colors, null);
      } else {
        const colors = colorTable(pixels, offset + 8, true);
        const alpha = format === "dxt3" ? dxt3Alpha(pixels, offset) : dxt5Alpha(pixels, offset);
        writeColorBlock(rgba, width, height, originX, originY, pixels, offset + 12, colors, alpha);
      }
    }
  }
  return rgba;
}

function expand565(color: number): [number, number, number] {
  return [
    Math.round((((color >> 11) & 31) * 255) / 31),
    Math.round((((color >> 5) & 63) * 255) / 63),
    Math.round(((color & 31) * 255) / 31),
  ];
}

function colorTable(block: Uint8Array, offset: number, fourColors: boolean): Array<[number, number, number, number]> {
  const c0 = (block[offset] ?? 0) | ((block[offset + 1] ?? 0) << 8);
  const c1 = (block[offset + 2] ?? 0) | ((block[offset + 3] ?? 0) << 8);
  const [r0, g0, b0] = expand565(c0);
  const [r1, g1, b1] = expand565(c1);
  const colors: Array<[number, number, number, number]> = [
    [r0, g0, b0, 255],
    [r1, g1, b1, 255],
    [0, 0, 0, 255],
    [0, 0, 0, 0],
  ];
  if (fourColors || c0 > c1) {
    colors[2] = [
      Math.round((2 * r0 + r1) / 3),
      Math.round((2 * g0 + g1) / 3),
      Math.round((2 * b0 + b1) / 3),
      255,
    ];
    colors[3] = [
      Math.round((r0 + 2 * r1) / 3),
      Math.round((g0 + 2 * g1) / 3),
      Math.round((b0 + 2 * b1) / 3),
      255,
    ];
  } else {
    colors[2] = [
      Math.round((r0 + r1) / 2),
      Math.round((g0 + g1) / 2),
      Math.round((b0 + b1) / 2),
      255,
    ];
    colors[3] = [0, 0, 0, 0];
  }
  return colors;
}

function writeColorBlock(
  rgba: Uint8Array,
  width: number,
  height: number,
  originX: number,
  originY: number,
  block: Uint8Array,
  indexOffset: number,
  colors: Array<[number, number, number, number]>,
  alpha: Uint8Array | null,
) {
  let packed =
    (block[indexOffset] ?? 0) +
    (block[indexOffset + 1] ?? 0) * 256 +
    (block[indexOffset + 2] ?? 0) * 65536 +
    (block[indexOffset + 3] ?? 0) * 16777216;
  for (let i = 0; i < 16; i++) {
    const code = packed & 3;
    packed = Math.floor(packed / 4);
    const color = colors[code] ?? [0, 0, 0, 0];
    const x = originX + (i % 4);
    const y = originY + Math.floor(i / 4);
    if (x >= width || y >= height) continue;
    const pixel = (y * width + x) * 4;
    rgba[pixel] = color[0];
    rgba[pixel + 1] = color[1];
    rgba[pixel + 2] = color[2];
    rgba[pixel + 3] = alpha ? (alpha[i] ?? 255) : color[3];
  }
}

function dxt3Alpha(block: Uint8Array, offset: number): Uint8Array {
  const alpha = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    const byte = block[offset + (i >> 1)] ?? 0;
    const nibble = (i & 1) === 0 ? byte & 0x0f : byte >> 4;
    alpha[i] = nibble * 17;
  }
  return alpha;
}

function dxt5Alpha(block: Uint8Array, offset: number): Uint8Array {
  const a0 = block[offset] ?? 0;
  const a1 = block[offset + 1] ?? 0;
  const table = [a0, a1, 0, 0, 0, 0, 0, 0];
  if (a0 > a1) {
    for (let i = 1; i <= 6; i++) table[i + 1] = Math.floor((a0 * (7 - i) + a1 * i) / 7);
  } else {
    for (let i = 1; i <= 4; i++) table[i + 1] = Math.floor((a0 * (5 - i) + a1 * i) / 5);
    table[6] = 0;
    table[7] = 255;
  }
  const alpha = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    const bit = i * 3;
    const byteIndex = offset + 2 + (bit >> 3);
    const shift = bit & 7;
    const value = (block[byteIndex] ?? 0) | ((block[byteIndex + 1] ?? 0) << 8);
    alpha[i] = table[(value >> shift) & 7] ?? 255;
  }
  return alpha;
}

type Channel = { shift: number; bits: number; present: boolean };

function channelFromMask(mask: number): Channel {
  if (mask === 0) return { shift: 0, bits: 0, present: false };
  let value = mask >>> 0;
  let shift = 0;
  while ((value & 1) === 0) {
    value >>>= 1;
    shift++;
  }
  let bits = 0;
  while ((value & 1) === 1) {
    value >>>= 1;
    bits++;
  }
  return { shift, bits, present: true };
}

function sample(pixel: number, channel: Channel, missing: number): number {
  if (!channel.present) return missing;
  const raw = (pixel >>> channel.shift) & ((1 << channel.bits) - 1);
  if (channel.bits >= 8) return (raw >>> (channel.bits - 8)) & 255;
  const max = (1 << channel.bits) - 1;
  return Math.round((raw * 255) / max);
}

function decodeUncompressed(
  input: Uint8Array,
  view: DataView,
  pixels: Uint8Array,
  width: number,
  height: number,
  bitCount: number,
): Uint8Array {
  const bpp = bitCount / 8;
  const rowBytes = width * bpp;
  const headerFlags = view.getUint32(8, true);
  const pitch = view.getUint32(20, true);
  let stride = rowBytes;
  if ((headerFlags & 0x8) !== 0 && pitch >= rowBytes && pitch * height <= input.byteLength - 128) {
    stride = pitch;
  }
  if (pixels.byteLength < stride * (height - 1) + rowBytes) throw new Error("That DDS file is incomplete");

  let rMask = view.getUint32(92, true);
  let gMask = view.getUint32(96, true);
  let bMask = view.getUint32(100, true);
  let aMask = view.getUint32(104, true);
  if (rMask === 0 && gMask === 0 && bMask === 0) {
    bMask = 0x000000ff;
    gMask = 0x0000ff00;
    rMask = 0x00ff0000;
    if (bitCount === 32) aMask = 0xff000000;
  }
  const red = channelFromMask(rMask);
  const green = channelFromMask(gMask);
  const blue = channelFromMask(bMask);
  const alpha = channelFromMask(aMask);
  const rgba = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * stride + x * bpp;
      const pixel =
        bpp === 4
          ? ((pixels[start] ?? 0) +
              (pixels[start + 1] ?? 0) * 256 +
              (pixels[start + 2] ?? 0) * 65536 +
              (pixels[start + 3] ?? 0) * 16777216) >>>
            0
          : (pixels[start] ?? 0) | ((pixels[start + 1] ?? 0) << 8) | ((pixels[start + 2] ?? 0) << 16);
      const index = (y * width + x) * 4;
      rgba[index] = sample(pixel, red, 0);
      rgba[index + 1] = sample(pixel, green, 0);
      rgba[index + 2] = sample(pixel, blue, 0);
      rgba[index + 3] = sample(pixel, alpha, 255);
    }
  }
  return rgba;
}
