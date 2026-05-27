/**
 * Minimal ZIP unpacker — no npm dep, uses the browser's native
 * `DecompressionStream("deflate-raw")` for the actual inflate.
 *
 * Why we wrote this instead of pulling JSZip:
 *   - JSZip is ~100KB minified; we only need read + flat extract
 *   - Avoids requiring users to `npm install` after pulling code
 *   - The ZIP format is small and well-documented; the parts we need
 *     fit in a single file
 *
 * Limitations (intentional — re-add only as needed):
 *   - Read-only (no creation)
 *   - Compression methods: stored (0) and deflate (8). Anything else
 *     throws. ZIP64 extra-field expansion is not parsed; archives
 *     >4GB will fail loudly.
 *   - We skip directory entries (filename ending in '/').
 *
 * Spec reference: APPNOTE.TXT section 4.3 (PKWARE ZIP file format).
 */

const SIG_EOCD  = 0x06054b50;
const SIG_CDIR  = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

// Maximum size of the EOCD comment we'll search through. The EOCD record
// itself is 22 bytes; the comment is up to 64KB. We scan back from EOF.
const MAX_EOCD_SEARCH = 22 + 0xffff;

// ---------------------------------------------------------------------------
// Byte readers
// ---------------------------------------------------------------------------

const readU16LE = (view: DataView, off: number): number => view.getUint16(off, true);
const readU32LE = (view: DataView, off: number): number => view.getUint32(off, true);

// ---------------------------------------------------------------------------
// Locate the End-Of-Central-Directory record
// ---------------------------------------------------------------------------

interface EOCDRecord {
  readonly entryCount: number;
  readonly cdSize: number;
  readonly cdOffset: number;
}

const findEOCD = (buf: Uint8Array): EOCDRecord => {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const start = Math.max(0, buf.length - MAX_EOCD_SEARCH);
  // Scan backwards from EOF until the EOCD signature appears.
  for (let i = buf.length - 22; i >= start; i--) {
    if (readU32LE(view, i) === SIG_EOCD) {
      return {
        entryCount: readU16LE(view, i + 10),
        cdSize:     readU32LE(view, i + 12),
        cdOffset:   readU32LE(view, i + 16),
      };
    }
  }
  throw new Error('ZIP: end-of-central-directory record not found (corrupt archive?)');
};

// ---------------------------------------------------------------------------
// Walk the central directory and build per-entry descriptors
// ---------------------------------------------------------------------------

interface CDEntry {
  readonly name: string;
  readonly compressionMethod: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
}

const readCentralDirectory = (
  buf: Uint8Array,
  eocd: EOCDRecord,
): CDEntry[] => {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const entries: CDEntry[] = [];
  let off = eocd.cdOffset;
  for (let i = 0; i < eocd.entryCount; i++) {
    if (readU32LE(view, off) !== SIG_CDIR) {
      throw new Error(`ZIP: bad central-directory header at offset ${off}`);
    }
    const compressionMethod = readU16LE(view, off + 10);
    const compressedSize    = readU32LE(view, off + 20);
    const uncompressedSize  = readU32LE(view, off + 24);
    const nameLen   = readU16LE(view, off + 28);
    const extraLen  = readU16LE(view, off + 30);
    const cmtLen    = readU16LE(view, off + 32);
    const localHeaderOffset = readU32LE(view, off + 42);
    const nameBytes = buf.subarray(off + 46, off + 46 + nameLen);
    const name = new TextDecoder('utf-8').decode(nameBytes);
    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    off += 46 + nameLen + extraLen + cmtLen;
  }
  return entries;
};

// ---------------------------------------------------------------------------
// Extract one entry: skip the local header, then inflate (or copy) bytes
// ---------------------------------------------------------------------------

const inflateRaw = async (compressed: Uint8Array): Promise<Uint8Array> => {
  // The browser's DecompressionStream("deflate-raw") inflates bare deflate
  // streams (no zlib wrapper) — exactly what's stored inside a ZIP entry.
  // Copy into a fresh ArrayBuffer-backed Uint8Array so the writer accepts
  // it (it rejects SharedArrayBuffer-backed views in strict TS settings).
  const buf = new ArrayBuffer(compressed.byteLength);
  new Uint8Array(buf).set(compressed);
  const fresh = new Uint8Array(buf);
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  void writer.write(fresh);
  void writer.close();
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const c of chunks) {
    out.set(c, cursor);
    cursor += c.byteLength;
  }
  return out;
};

const extractEntry = async (
  buf: Uint8Array,
  entry: CDEntry,
): Promise<Uint8Array> => {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const off = entry.localHeaderOffset;
  if (readU32LE(view, off) !== SIG_LOCAL) {
    throw new Error(`ZIP: bad local file header for ${entry.name}`);
  }
  const nameLen  = readU16LE(view, off + 26);
  const extraLen = readU16LE(view, off + 28);
  const dataStart = off + 30 + nameLen + extraLen;
  const data = buf.subarray(dataStart, dataStart + entry.compressedSize);
  switch (entry.compressionMethod) {
    case 0: // Stored — bytes are already raw
      return data;
    case 8: // Deflate
      return inflateRaw(data);
    default:
      throw new Error(
        `ZIP: unsupported compression method ${entry.compressionMethod} ` +
        `for ${entry.name} (only stored=0 and deflate=8 are supported)`,
      );
  }
};

// ---------------------------------------------------------------------------
// Public — unpack a Zip File into a flat array of File objects
// ---------------------------------------------------------------------------

/**
 * Unzip a `File` (or any Blob) into a flat array of `File`s, one per
 * entry. Directory entries are skipped. Each output File is named by
 * its basename (path stripped) so that downstream sibling-resolution
 * matches whatever the manifest references.
 *
 * The downstream loader uses a basename-only sibling map, so we don't
 * need to preserve folder structure here.
 */
export const unzipToFiles = async (zip: Blob): Promise<File[]> => {
  const buf = new Uint8Array(await zip.arrayBuffer());
  const eocd = findEOCD(buf);
  const cdEntries = readCentralDirectory(buf, eocd);
  const out: File[] = [];
  for (const entry of cdEntries) {
    if (entry.name.endsWith('/')) continue;     // directory entry
    if (entry.uncompressedSize === 0) continue; // empty
    // Skip __MACOSX/* metadata Apple sneaks into archives created on macOS.
    if (entry.name.startsWith('__MACOSX/')) continue;
    if (entry.name.split('/').pop()?.startsWith('._')) continue;
    const data = await extractEntry(buf, entry);
    const basename = entry.name.split('/').pop() ?? entry.name;
    // application/octet-stream is a safe default; format-specific loaders
    // never read .type, only the file extension. Use a fresh ArrayBuffer
    // so the File is independent of the underlying ZIP buffer.
    const blobBuf = new ArrayBuffer(data.byteLength);
    new Uint8Array(blobBuf).set(data);
    out.push(new File([blobBuf], basename, { type: 'application/octet-stream' }));
  }
  return out;
};
