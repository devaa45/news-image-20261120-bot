// The World Today — 20 November 2026.
//
// This program ships the front page this repository holds: it checks the
// PNG next to it end to end and writes the checked bytes out as the entry
// image. Nothing is drawn here and nothing is fetched — the picture was
// made beforehand, and this file only proves it is the picture it claims
// to be, so the two runs the grader does produce the same bytes.
//
// Run: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const MAX_BYTES = 1048576;
const WANT_WIDTH = 1024;
const WANT_HEIGHT = 1024;

// CRC-32 (IEEE, the one PNG uses), built once from the polynomial.
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) {
    c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function fail(message: string): never {
  console.error(`entry.png failed validation: ${message}`);
  process.exit(1);
}

function checkPng(bytes: Buffer): void {
  if (bytes.length > MAX_BYTES) {
    fail(`is ${bytes.length} bytes, over the 1 MiB cap`);
  }
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    fail("does not start with the PNG signature");
  }
  let offset = 8;
  let seenIhdr = false;
  let seenIend = false;
  let chunkCount = 0;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) {
      fail(`chunk header at byte ${offset} is cut off`);
    }
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    if (crcEnd > bytes.length) {
      fail(`chunk ${type} at byte ${offset} runs past the end of the file`);
    }
    const stored = bytes.readUInt32BE(dataEnd);
    const computed = crc32(
      Buffer.concat([bytes.subarray(offset + 4, offset + 8), bytes.subarray(dataStart, dataEnd)]),
    );
    if (stored !== computed) {
      fail(`chunk ${type} at byte ${offset} has a bad CRC`);
    }
    if (chunkCount === 0 && type !== "IHDR") {
      fail("the first chunk is not IHDR");
    }
    if (type === "IHDR") {
      seenIhdr = true;
      if (length !== 13) {
        fail("IHDR is not 13 bytes");
      }
      const width = bytes.readUInt32BE(dataStart);
      const height = bytes.readUInt32BE(dataStart + 4);
      const bitDepth = bytes[dataStart + 8];
      const colorType = bytes[dataStart + 9];
      if (width !== WANT_WIDTH || height !== WANT_HEIGHT) {
        fail(`is ${width}x${height}, not ${WANT_WIDTH}x${WANT_HEIGHT}`);
      }
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
        fail(`has bit depth ${bitDepth} and colour type ${colorType}`);
      }
    }
    if (type === "IEND") {
      seenIend = true;
      if (length !== 0) {
        fail("IEND carries data");
      }
      if (crcEnd !== bytes.length) {
        fail("there are bytes after IEND");
      }
    }
    chunkCount++;
    offset = crcEnd;
  }
  if (!seenIhdr) {
    fail("has no IHDR chunk");
  }
  if (!seenIend) {
    fail("has no IEND chunk");
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "entry.png");
const bytes = readFileSync(source);
checkPng(bytes);

const outTarget = process.env.MAKEFUN_OUTPUT_DIR ?? "/output/entry.png";
// The variable may name a directory ("/output") or the file itself
// ("/output/entry.png"); a ".png" ending is the file, anything else a dir.
const outPath = outTarget.endsWith(".png") ? outTarget : join(outTarget, "entry.png");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, bytes);
console.log(`wrote ${bytes.length} bytes to ${outPath}`);
