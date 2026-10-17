import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { inflateSync } from "fflate";

const EOCD_SIG = 0x06054b50;
const CFH_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;

export type ZipEntryInfo = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
  encrypted: boolean;
};

export type ZipFile = {
  list: () => ZipEntryInfo[];
  read: (entry: ZipEntryInfo) => Uint8Array;
};

/** Read the central directory, then inflate only the entries the caller asks for. */
export function withZip<T>(filePath: string, use: (zip: ZipFile) => T): T {
  const fd = openSync(filePath, "r");
  try {
    const size = fstatSync(fd).size;
    return use({
      list: () => listEntries(fd, size),
      read: (entry) => readEntry(fd, entry),
    });
  } finally {
    closeSync(fd);
  }
}

function readAt(fd: number, position: number, length: number): Buffer {
  if (length < 0 || position < 0) throw new Error("Invalid zip offset");
  const buf = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const read = readSync(fd, buf, offset, length - offset, position + offset);
    if (read <= 0) throw new Error("Unexpected end of zip");
    offset += read;
  }
  return buf;
}

function listEntries(fd: number, size: number): ZipEntryInfo[] {
  if (size < 22) return [];
  const tailLength = Math.min(size, 22 + 65535);
  const tail = readAt(fd, size - tailLength, tailLength);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) !== EOCD_SIG) continue;
    const commentLength = tail.readUInt16LE(i + 20);
    if (i + 22 + commentLength === tail.length) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];

  const count = tail.readUInt16LE(eocd + 10);
  const directorySize = tail.readUInt32LE(eocd + 12);
  const directoryOffset = tail.readUInt32LE(eocd + 16);
  if (directoryOffset === 0xffffffff || directorySize === 0xffffffff) return [];
  if (directorySize > 32 * 1024 * 1024) return [];

  const directory = readAt(fd, directoryOffset, directorySize);
  const entries: ZipEntryInfo[] = [];
  let cursor = 0;
  for (let index = 0; index < count && cursor + 46 <= directory.length; index++) {
    if (directory.readUInt32LE(cursor) !== CFH_SIG) break;
    const flags = directory.readUInt16LE(cursor + 8);
    const method = directory.readUInt16LE(cursor + 10);
    const compressedSize = directory.readUInt32LE(cursor + 20);
    const uncompressedSize = directory.readUInt32LE(cursor + 24);
    const nameLength = directory.readUInt16LE(cursor + 28);
    const extraLength = directory.readUInt16LE(cursor + 30);
    const commentLength = directory.readUInt16LE(cursor + 32);
    const localOffset = directory.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > directory.length) break;
    const name = directory.subarray(nameStart, nameEnd).toString("utf8").replace(/\\/g, "/");
    if (!name.endsWith("/") && compressedSize !== 0xffffffff && uncompressedSize !== 0xffffffff) {
      entries.push({
        name,
        method,
        compressedSize,
        uncompressedSize,
        localOffset,
        encrypted: (flags & 0x1) !== 0,
      });
    }
    cursor = nameEnd + extraLength + commentLength;
  }
  return entries;
}

function readEntry(fd: number, entry: ZipEntryInfo): Uint8Array {
  if (entry.encrypted) throw new Error("Encrypted zip entries are not supported");
  if (entry.method !== 0 && entry.method !== 8) throw new Error("That zip compression is not supported");
  const header = readAt(fd, entry.localOffset, 30);
  if (header.readUInt32LE(0) !== LFH_SIG) throw new Error("Invalid zip entry");
  const nameLength = header.readUInt16LE(26);
  const extraLength = header.readUInt16LE(28);
  const dataOffset = entry.localOffset + 30 + nameLength + extraLength;
  const compressed = readAt(fd, dataOffset, entry.compressedSize);
  if (entry.method === 0) return compressed;
  const inflated = inflateSync(compressed);
  if (inflated.byteLength !== entry.uncompressedSize && entry.uncompressedSize !== 0) {
    throw new Error("Zip entry size did not match");
  }
  return inflated;
}
