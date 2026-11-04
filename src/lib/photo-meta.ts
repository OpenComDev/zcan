/**
 * Photo metadata inspector + cleaner. Everything runs in the browser; files never leave the device.
 */

export type MetaItem = {
  group: "EXIF" | "GPS" | "XMP" | "IPTC" | "Text";
  label: string;
  value: string;
  sensitive?: boolean;
  /** Stable id for `label` (absent when the label is a raw key from the file, e.g. a PNG text chunk name). */
  labelId?: string;
  /** Stable id for a fixed `value` description, with its variables. Absent when the value is data from the file. */
  valueId?: string;
  valueVars?: Record<string, string>;
};

export type Inspection = {
  format: "jpeg" | "png" | "webp" | "other";
  items: MetaItem[];
  gps?: { lat: number; lon: number };
};

// ---------- TIFF / EXIF ----------

// [stable id, English label]
const TAGS_IFD0: Record<number, [string, string]> = {
  0x010f: ["make", "Camera make"],
  0x0110: ["model", "Camera model"],
  0x0131: ["software", "Software"],
  0x0132: ["modified", "Modified"],
  0x013b: ["artist", "Artist"],
  0x8298: ["copyright", "Copyright"],
  0x010e: ["description", "Description"],
};
const TAGS_EXIF: Record<number, [string, string]> = {
  0x9003: ["taken", "Taken"],
  0x9004: ["digitized", "Digitized"],
  0xa434: ["lens", "Lens"],
  0xa431: ["serial", "Camera serial"],
  0xa430: ["owner", "Owner"],
  0xa435: ["lensSerial", "Lens serial"],
  0x9010: ["timezone", "Time zone"],
};

function parseTiff(view: DataView, start: number, items: MetaItem[]): { lat: number; lon: number } | undefined {
  const order = view.getUint16(start);
  const le = order === 0x4949;
  if (!le && order !== 0x4d4d) return;
  const u16 = (o: number) => view.getUint16(start + o, le);
  const u32 = (o: number) => view.getUint32(start + o, le);
  const len = view.byteLength - start;

  const ascii = (off: number, count: number) => {
    let s = "";
    for (let i = 0; i < count && off + i < len; i++) {
      const c = view.getUint8(start + off + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  };
  const rational = (off: number) => {
    const d = u32(off + 4);
    return d ? u32(off) / d : 0;
  };

  type Entry = { tag: number; type: number; count: number; valOff: number };
  const readIfd = (off: number): Entry[] => {
    if (off <= 0 || off + 2 > len) return [];
    const n = u16(off);
    const out: Entry[] = [];
    for (let i = 0; i < n && off + 2 + i * 12 + 12 <= len; i++) {
      const e = off + 2 + i * 12;
      const type = u16(e + 2);
      const count = u32(e + 4);
      const size = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 } as Record<number, number>)[type] ?? 1;
      out.push({ tag: u16(e), type, count, valOff: size * count <= 4 ? e + 8 : u32(e + 8) });
    }
    return out;
  };

  const ifd0 = readIfd(u32(4));
  let gps: { lat: number; lon: number } | undefined;
  for (const e of ifd0) {
    if (TAGS_IFD0[e.tag] && e.type === 2) {
      const v = ascii(e.valOff, e.count);
      if (v) items.push({ group: "EXIF", label: TAGS_IFD0[e.tag][1], labelId: TAGS_IFD0[e.tag][0], value: v, sensitive: e.tag === 0x013b });
    }
    if (e.tag === 0x8769) {
      for (const x of readIfd(u32(e.valOff))) {
        if (TAGS_EXIF[x.tag] && x.type === 2) {
          const v = ascii(x.valOff, x.count);
          if (v) items.push({ group: "EXIF", label: TAGS_EXIF[x.tag][1], labelId: TAGS_EXIF[x.tag][0], value: v, sensitive: x.tag === 0xa431 || x.tag === 0xa430 });
        }
      }
    }
    if (e.tag === 0x8825) {
      const g = readIfd(u32(e.valOff));
      const get = (t: number) => g.find((x) => x.tag === t);
      const dms = (x?: Entry) => (x && x.type === 5 && x.count >= 3 ? rational(x.valOff) + rational(x.valOff + 8) / 60 + rational(x.valOff + 16) / 3600 : NaN);
      const ref = (x?: Entry) => (x ? String.fromCharCode(view.getUint8(start + x.valOff)) : "");
      let lat = dms(get(2));
      let lon = dms(get(4));
      if (ref(get(1)) === "S") lat = -lat;
      if (ref(get(3)) === "W") lon = -lon;
      if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) {
        gps = { lat, lon };
        items.push({ group: "GPS", label: "Location", labelId: "location", value: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, sensitive: true });
      }
      const alt = get(6);
      if (alt && alt.type === 5) items.push({ group: "GPS", label: "Altitude", labelId: "altitude", value: `${rational(alt.valOff).toFixed(0)} m`, sensitive: true });
      const ts = get(29);
      if (ts && ts.type === 2) items.push({ group: "GPS", label: "GPS date", labelId: "gpsDate", value: ascii(ts.valOff, ts.count) });
      if (!gps && g.length) items.push({ group: "GPS", label: "GPS block", labelId: "gpsBlock", value: "Present", valueId: "present", sensitive: true });
    }
  }
  return gps;
}

const startsWith = (view: DataView, off: number, text: string) => {
  for (let i = 0; i < text.length; i++) if (off + i >= view.byteLength || view.getUint8(off + i) !== text.charCodeAt(i)) return false;
  return true;
};

const XMP_ITEM: MetaItem = { group: "XMP", label: "XMP", value: "Editing history and app data", valueId: "xmp" };

function xmpItem(view: DataView, off: number, size: number): MetaItem {
  const bytes = new Uint8Array(view.buffer, view.byteOffset + off, Math.min(size, view.byteLength - off));
  const text = new TextDecoder().decode(bytes);
  const tool = text.match(/CreatorTool[=>"]+([^"<]+)/)?.[1]?.trim();
  return tool ? { ...XMP_ITEM, value: `Editing history (${tool})`, valueId: "xmpTool", valueVars: { tool } } : { ...XMP_ITEM };
}

// ---------- containers ----------

export async function inspectPhoto(file: Blob): Promise<Inspection> {
  const buf = await file.arrayBuffer();
  const view = new DataView(buf);
  const items: MetaItem[] = [];
  let gps: Inspection["gps"];

  if (view.byteLength > 3 && view.getUint16(0) === 0xffd8) {
    let off = 2;
    while (off + 4 <= view.byteLength) {
      if (view.getUint8(off) !== 0xff) break;
      const marker = view.getUint8(off + 1);
      if (marker === 0xda || marker === 0xd9) break; // start of scan / end
      const size = view.getUint16(off + 2);
      const body = off + 4;
      if (marker === 0xe1 && startsWith(view, body, "Exif\0\0")) gps = parseTiff(view, body + 6, items) ?? gps;
      else if (marker === 0xe1 && startsWith(view, body, "http://ns.adobe.com/xap/"))
        items.push(xmpItem(view, body, size - 2));
      else if (marker === 0xed && startsWith(view, body, "Photoshop 3.0"))
        items.push({ group: "IPTC", label: "IPTC", value: "Author, caption or location fields", valueId: "iptc", sensitive: true });
      else if (marker === 0xfe) items.push({ group: "Text", label: "Comment", labelId: "comment", value: "Embedded comment", valueId: "comment" });
      off = body + size - 2;
    }
    return { format: "jpeg", items, gps };
  }

  if (view.byteLength > 8 && view.getUint32(0) === 0x89504e47) {
    let off = 8;
    while (off + 8 <= view.byteLength) {
      const len = view.getUint32(off);
      const type = String.fromCharCode(...new Uint8Array(buf, off + 4, 4));
      if (type === "eXIf") gps = parseTiff(view, off + 8, items) ?? gps;
      else if (type === "tEXt" || type === "iTXt" || type === "zTXt") {
        const key = new TextDecoder().decode(new Uint8Array(buf, off + 8, Math.min(len, 79))).split("\0")[0];
        items.push(
          key === "XML:com.adobe.xmp"
            ? { ...XMP_ITEM }
            : { group: "Text", label: key || "Text", labelId: key ? undefined : "text", value: "Embedded text", valueId: "text" },
        );
      }
      if (type === "IEND") break;
      off += 12 + len;
    }
    return { format: "png", items, gps };
  }

  if (view.byteLength > 12 && startsWith(view, 0, "RIFF") && startsWith(view, 8, "WEBP")) {
    let off = 12;
    while (off + 8 <= view.byteLength) {
      const id = String.fromCharCode(...new Uint8Array(buf, off, 4));
      const len = view.getUint32(off + 4, true);
      if (id === "EXIF") gps = parseTiff(view, off + 8 + (startsWith(view, off + 8, "Exif\0\0") ? 6 : 0), items) ?? gps;
      if (id === "XMP ") items.push({ ...XMP_ITEM });
      off += 8 + len + (len % 2);
    }
    return { format: "webp", items, gps };
  }

  return { format: "other", items };
}

/** Re-encode through a canvas. Pixels only: EXIF, GPS, XMP and IPTC are all dropped. */
export async function cleanPhoto(file: Blob, quality = 0.92): Promise<Blob> {
  // Browsers apply EXIF orientation here, so the clean copy stays upright.
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser can't process images.");
  ctx.fillStyle = "#fff"; // JPEG has no alpha
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Couldn't create the clean copy.");
  return blob;
}
