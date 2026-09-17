import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

interface PngFingerprint {
  digest: string;
  width: number;
  height: number;
  colorType: number;
}

function paeth(left: number, above: number, upperLeft: number) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

/**
 * Hashes decoded pixels rather than PNG encoding bytes. The top-left 12×12
 * pixels are excluded because the test-only screencast heartbeat lives there;
 * a distinct digest therefore proves the product pixels changed.
 */
export function semanticPngFingerprint(png: Buffer): PngFingerprint {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!png.subarray(0, 8).equals(signature)) throw new Error("Expected PNG signature");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  const imageParts: Buffer[] = [];
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? -1;
      interlace = data[12] ?? 0;
    } else if (type === "IDAT") imageParts.push(data);
    offset += length + 12;
    if (type === "IEND") break;
  }
  if (!width || !height || bitDepth !== 8 || interlace !== 0 || ![2, 6].includes(colorType)) {
    throw new Error(`Unsupported compositor PNG ${width}×${height}, depth ${bitDepth}, color ${colorType}, interlace ${interlace}`);
  }
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const rowBytes = width * bytesPerPixel;
  const encoded = inflateSync(Buffer.concat(imageParts));
  const decoded = Buffer.alloc(rowBytes * height);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = encoded[source++] ?? -1;
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = encoded[source++] ?? 0;
      const destination = y * rowBytes + x;
      const left = x >= bytesPerPixel ? decoded[destination - bytesPerPixel]! : 0;
      const above = y > 0 ? decoded[destination - rowBytes]! : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? decoded[destination - rowBytes - bytesPerPixel]! : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? above
            : filter === 3 ? Math.floor((left + above) / 2)
              : filter === 4 ? paeth(left, above, upperLeft) : Number.NaN;
      if (!Number.isFinite(predictor)) throw new Error(`Unsupported PNG filter ${filter}`);
      decoded[destination] = (raw + predictor) & 0xff;
    }
  }
  const hash = createHash("sha256");
  hash.update(`${width}x${height}/${colorType}\n`);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowBytes;
    const excludedPixels = y < 12 ? Math.min(12, width) : 0;
    hash.update(decoded.subarray(rowStart + excludedPixels * bytesPerPixel, rowStart + rowBytes));
  }
  return { digest: hash.digest("hex"), width, height, colorType };
}
