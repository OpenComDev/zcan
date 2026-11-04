/**
 * Document metadata inspector + cleaner for PDF and Office Open XML (.docx, .xlsx, .pptx).
 * Everything runs on-device; files never leave the browser. No DOM APIs, so it also runs under Node for tests.
 */
import JSZip from "jszip";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFRef,
  PDFStream,
  PDFString,
  decodePDFRawStream,
  type PDFObject,
} from "pdf-lib";

export type DocKind = "pdf" | "docx" | "xlsx" | "pptx";

/** Short tag for where a field lives. Stable ids; the UI maps them to display text. */
export type DocGroup = "Info" | "XMP" | "App" | "ID" | "Notes" | "Core" | "Custom" | "Thumb" | "Track" | "People" | "Word" | "Excel";

/** How the UI should present `DocItem.value`. Absent = show `value` as-is. */
export type DocValueCode =
  | "date" // value is an ISO date string
  | "unknownDate"
  | "xmp" // see `xmp`
  | "present"
  | "xmpMore" // n blocks on pages or images
  | "pieceInfo" // n app-private data blocks
  | "minutes" // n minutes
  | "empty"
  | "thumbnail"
  | "unnamed"
  | "rsids"; // n save sessions

/**
 * A field found in the file. Display text is left to the UI: `label` is a stable field id
 * (e.g. "author", "lastSavedBy") unless `custom` is set — then it is the file's own property name.
 */
export type DocItem = {
  group: DocGroup;
  label: string;
  custom?: boolean;
  /** Raw text from the file (names, paths, IDs), or an ISO date for code "date". */
  value: string;
  code?: DocValueCode;
  /** Count for "xmpMore", "pieceInfo", "minutes" and "rsids". */
  n?: number;
  /** XMP summary for code "xmp". */
  xmp?: { authors?: string; tool?: string; history: boolean };
  sensitive?: boolean;
};

export type DocFlagCode =
  | "pdfMarkup"
  | "pdfRedact"
  | "pdfAttachments"
  | "pdfForms"
  | "macros"
  | "docxComments"
  | "docxChanges"
  | "docxHidden"
  | "xlsxComments"
  | "xlsxChanges"
  | "xlsxHidden"
  | "pptxComments"
  | "pptxNotes"
  | "pptxHidden";

/**
 * Something inside the content itself. The standard clean leaves these alone unless `removable` says otherwise.
 * `code` picks the display text; `n` / `ins` / `del` are the counts it mentions.
 */
export type DocFlag = { id: string; code: DocFlagCode; n?: number; ins?: number; del?: number; removable?: "annotations" | "comments" };

export type DocInspection = { kind: DocKind; items: DocItem[]; flags: DocFlag[] };

export type CleanOptions = {
  /** PDF: remove comment and markup annotations (sticky notes, highlights, ink, stamps). Links and form fields stay. */
  removeAnnotations?: boolean;
  /** .docx: remove comments and their anchors. */
  removeComments?: boolean;
};

export type CleanResult = { blob: Blob; kind: DocKind; ext: string };

export type DocErrorCode = "unsupported" | "legacy" | "pdfDamaged" | "pdfEncrypted" | "officeDamaged";

/** A user-facing failure. `code` picks the message in the UI. */
export class DocError extends Error {
  readonly code: DocErrorCode;
  constructor(code: DocErrorCode) {
    super(code);
    this.code = code;
  }
}

/** Dates in cleaned Office files are set to this instead of the real ones. */
export const NEUTRAL_DATE = "2000-01-01T00:00:00Z";

const MIME: Record<DocKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** A date field: ISO value for the UI to format, or "unknownDate". */
const dateItem = (d: Date): Pick<DocItem, "value" | "code"> =>
  Number.isNaN(d.getTime()) ? { value: "", code: "unknownDate" } : { value: d.toISOString(), code: "date" };
const list = (names: Iterable<string>, max = 3) => {
  const all = [...new Set([...names].map((n) => n.trim()).filter(Boolean))];
  return all.length <= max ? all.join(", ") : `${all.slice(0, max).join(", ")} +${all.length - max}`;
};

// ---------- entry points ----------

async function sniff(file: Blob): Promise<"pdf" | "zip" | "ole" | null> {
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) return "zip";
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return "ole";
  if (String.fromCharCode(...head).includes("%PDF-")) return "pdf";
  return null;
}


export async function inspectDocument(file: Blob): Promise<DocInspection> {
  const type = await sniff(file);
  if (type === "pdf") return inspectPdf(await loadPdf(await file.arrayBuffer()));
  if (type === "zip") {
    const { zip, kind } = await loadOffice(file);
    return inspectOffice(zip, kind);
  }
  if (type === "ole") throw new DocError("legacy");
  throw new DocError("unsupported");
}

export async function cleanDocument(file: Blob, options: CleanOptions = {}): Promise<CleanResult> {
  const type = await sniff(file);
  if (type === "pdf") {
    const bytes = await cleanPdf(await loadPdf(await file.arrayBuffer()), options);
    return { blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: MIME.pdf }), kind: "pdf", ext: "pdf" };
  }
  if (type === "zip") {
    const { zip, kind } = await loadOffice(file);
    await cleanOffice(zip, kind, options);
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 }, mimeType: MIME[kind] });
    return { blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: MIME[kind] }), kind, ext: kind };
  }
  throw new DocError("unsupported");
}

// =====================================================================
// PDF
// =====================================================================

const N = (s: string) => PDFName.of(s);

async function loadPdf(bytes: ArrayBuffer): Promise<PDFDocument> {
  let doc: PDFDocument;
  try {
    // updateMetadata: false — otherwise pdf-lib stamps its own Producer and dates on load.
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
  } catch {
    throw new DocError("pdfDamaged");
  }
  if (doc.isEncrypted) {
    throw new DocError("pdfEncrypted");
  }
  return doc;
}

/** Field ids for the PDF Info dictionary. Unknown keys are shown under their own name. */
const INFO_LABELS: Record<string, { label: string; sensitive?: boolean }> = {
  Title: { label: "title" },
  Author: { label: "author", sensitive: true },
  Subject: { label: "subject" },
  Keywords: { label: "keywords" },
  Creator: { label: "createdWith" },
  Producer: { label: "producer" },
  CreationDate: { label: "created" },
  ModDate: { label: "modified" },
};

function pdfValue(key: string, obj: PDFObject | undefined): Pick<DocItem, "value" | "code"> | undefined {
  if (obj instanceof PDFString || obj instanceof PDFHexString) {
    if (/Date$/.test(key)) {
      try {
        return dateItem(obj.decodeDate());
      } catch {
        // fall through to the raw text
      }
    }
    const text = obj.decodeText().replace(/\0/g, "").trim();
    return text ? { value: text } : undefined;
  }
  if (obj instanceof PDFName) return { value: obj.decodeText() };
  const text = obj?.toString();
  return text ? { value: text } : undefined;
}

/** What an XMP packet says, for the summary line. */
function xmpSummary(stream: PDFStream): Pick<DocItem, "value" | "code" | "xmp"> {
  let xml = "";
  try {
    const bytes = stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents();
    xml = new TextDecoder().decode(bytes);
  } catch {
    return { value: "", code: "present" };
  }
  const creators = [...(xml.match(/<dc:creator>([\s\S]*?)<\/dc:creator>/)?.[1] ?? "").matchAll(/<rdf:li[^>]*>([^<]*)<\/rdf:li>/g)].map((m) => decodeXml(m[1]));
  const authors = creators.some(Boolean) ? list(creators) : undefined;
  const rawTool = xml.match(/CreatorTool(?:>|=")([^<"]+)/)?.[1];
  const tool = rawTool ? decodeXml(rawTool.trim()) : undefined;
  const history = /xmpMM:History|stEvt:/.test(xml);
  if (!authors && !tool && !history) return { value: "", code: "present" };
  return { value: [authors, tool].filter(Boolean).join(" · "), code: "xmp", xmp: { authors, tool, history } };
}

/** Annotation subtypes that are comments or markup. Links, form widgets and redactions are not touched. */
const MARKUP = new Set([
  "Text", "FreeText", "Line", "Square", "Circle", "Polygon", "PolyLine", "Highlight", "Underline", "Squiggly",
  "StrikeOut", "Stamp", "Caret", "Ink", "Popup", "FileAttachment", "Sound",
]);

function walkAnnotations(doc: PDFDocument, visit: (annot: PDFDict, subtype: string) => void) {
  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      const a = doc.context.lookupMaybe(annots.get(i), PDFDict);
      const sub = a?.lookupMaybe(N("Subtype"), PDFName)?.decodeText();
      if (a && sub) visit(a, sub);
    }
  }
}

function inspectPdf(doc: PDFDocument): DocInspection {
  const items: DocItem[] = [];
  const flags: DocFlag[] = [];
  const ctx = doc.context;

  const info = ctx.lookupMaybe(ctx.trailerInfo.Info, PDFDict);
  if (info) {
    for (const [k, v] of info.entries()) {
      const key = k.decodeText();
      const value = pdfValue(key, ctx.lookup(v));
      if (!value) continue;
      const known = INFO_LABELS[key];
      items.push({ group: "Info", label: known?.label ?? key, custom: !known || undefined, ...value, sensitive: known ? known.sensitive : true });
    }
  }

  let xmp = 0;
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFStream) || obj.dict.get(N("Type")) !== N("Metadata")) continue;
    xmp++;
    if (xmp === 1) items.push({ group: "XMP", label: "xmp", ...xmpSummary(obj), sensitive: true });
  }
  if (xmp > 1) items.push({ group: "XMP", label: "xmpMore", value: String(xmp - 1), code: "xmpMore", n: xmp - 1 });

  let piece = 0;
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFDict ? obj : obj instanceof PDFStream ? obj.dict : undefined;
    if (dict?.has(N("PieceInfo"))) piece++;
  }
  if (piece) items.push({ group: "App", label: "appPrivate", value: String(piece), code: "pieceInfo", n: piece });

  const id = ctx.lookupMaybe(ctx.trailerInfo.ID, PDFArray);
  const first = id && ctx.lookup(id.get(0));
  if (first instanceof PDFHexString || first instanceof PDFString) {
    const raw = first.asString();
    const hex = first instanceof PDFHexString ? raw : Array.from(raw, (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
    if (hex) items.push({ group: "ID", label: "fileId", value: `${hex.slice(0, 12).toLowerCase()}…` });
  }

  let markup = 0;
  let redact = 0;
  const authors: string[] = [];
  walkAnnotations(doc, (a, sub) => {
    if (sub === "Redact") redact++;
    if (!MARKUP.has(sub) || sub === "Popup") return;
    markup++;
    const t = a.lookupMaybe(N("T"), PDFString, PDFHexString)?.decodeText();
    if (t) authors.push(t);
  });
  if (authors.length) items.push({ group: "Notes", label: "commentAuthors", value: list(authors), sensitive: true });
  if (markup) flags.push({ id: "annotations", code: "pdfMarkup", n: markup, removable: "annotations" });
  if (redact) flags.push({ id: "redact", code: "pdfRedact", n: redact });

  const names = doc.catalog.lookupMaybe(N("Names"), PDFDict);
  if (names?.has(N("EmbeddedFiles"))) flags.push({ id: "attachments", code: "pdfAttachments" });
  if (doc.catalog.has(N("AcroForm"))) flags.push({ id: "forms", code: "pdfForms" });

  return { kind: "pdf", items, flags };
}

/** Drop every object no longer reachable from the catalog — old revisions, orphaned metadata, removed annotations. */
function collectGarbage(doc: PDFDocument) {
  const ctx = doc.context;
  const seen = new Set<PDFRef>();
  const stack: (PDFObject | undefined)[] = [ctx.trailerInfo.Root, ctx.trailerInfo.Info];
  while (stack.length) {
    const o = stack.pop();
    if (o instanceof PDFRef) {
      if (seen.has(o)) continue;
      seen.add(o);
      stack.push(ctx.lookup(o));
    } else if (o instanceof PDFDict) {
      for (const [, v] of o.entries()) stack.push(v);
    } else if (o instanceof PDFArray) {
      for (const v of o.asArray()) stack.push(v);
    } else if (o instanceof PDFStream) {
      stack.push(o.dict);
    }
  }
  for (const [ref] of ctx.enumerateIndirectObjects()) if (!seen.has(ref)) ctx.delete(ref);
}

async function cleanPdf(doc: PDFDocument, options: CleanOptions): Promise<Uint8Array> {
  const ctx = doc.context;

  // 1. Document Info dictionary: Title, Author, Creator, Producer, dates and any custom keys.
  ctx.trailerInfo.Info = undefined;

  // 2. XMP packets (catalog, pages, images) and app-private data.
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFDict ? obj : obj instanceof PDFStream ? obj.dict : undefined;
    if (!dict) continue;
    dict.delete(N("Metadata"));
    if (dict.has(N("PieceInfo"))) {
      dict.delete(N("PieceInfo"));
      dict.delete(N("LastModified"));
    }
  }

  // 3. Optional: comments and markup annotations.
  if (options.removeAnnotations) {
    for (const page of doc.getPages()) {
      const annots = page.node.Annots();
      if (!annots) continue;
      const keep: PDFObject[] = [];
      for (let i = 0; i < annots.size(); i++) {
        const ref = annots.get(i);
        const sub = ctx.lookupMaybe(ref, PDFDict)?.lookupMaybe(N("Subtype"), PDFName)?.decodeText();
        if (!sub || !MARKUP.has(sub)) keep.push(ref);
      }
      if (keep.length) page.node.set(N("Annots"), ctx.obj(keep));
      else page.node.delete(N("Annots"));
    }
  }

  // 4. The file ID can match this copy to the original (and to other versions of it). It's optional unless encrypted.
  ctx.trailerInfo.ID = undefined;

  // 5. Everything orphaned by the steps above (and older saved revisions) is dropped.
  collectGarbage(doc);

  return doc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
}

// =====================================================================
// Office Open XML
// =====================================================================

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return XML_ENTITIES[e] ?? m;
  });
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) out[m[1]] = decodeXml(m[3]);
  return out;
}

/** Text content of the first `<prefix:name>` element (any prefix). */
const element = (xml: string, name: string) =>
  xml.match(new RegExp(`<(?:[\\w]+:)?${name}\\b[^>]*?(?:/>|>([\\s\\S]*?)</(?:[\\w]+:)?${name}>)`))?.[1];

const stripTags = (s: string) => decodeXml(s.replace(/<[^>]+>/g, "")).trim();

/** A list of names, or "unnamed" when every entry is blank. */
const named = (names: string): Pick<DocItem, "value" | "code"> => (names ? { value: names } : { value: "", code: "unnamed" });

async function loadOffice(file: Blob): Promise<{ zip: JSZip; kind: DocKind }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new DocError("officeDamaged");
  }
  const kind: DocKind | null = zip.file("word/document.xml")
    ? "docx"
    : zip.file("xl/workbook.xml")
      ? "xlsx"
      : zip.file("ppt/presentation.xml")
        ? "pptx"
        : null;
  if (!kind || !zip.file("[Content_Types].xml")) throw new DocError("unsupported");
  return { zip, kind };
}

const read = async (zip: JSZip, path: string) => (await zip.file(path)?.async("string")) ?? undefined;
const paths = (zip: JSZip, re: RegExp) => Object.keys(zip.files).filter((p) => !zip.files[p].dir && re.test(p));

type Rel = { raw: string; type: string; target: string; external: boolean };

function parseRels(xml: string): Rel[] {
  return [...xml.matchAll(/<Relationship\b[^>]*?(?:\/>|>[\s\S]*?<\/Relationship>)/g)].map((m) => {
    const a = attrs(m[0].slice(0, m[0].indexOf(">") + 1));
    return { raw: m[0], type: a.Type ?? "", target: a.Target ?? "", external: a.TargetMode === "External" };
  });
}

/** Resolve a relationship target to a package path, relative to the .rels file's source part. */
function resolveTarget(relsPath: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = relsPath.replace(/_rels\/[^/]*\.rels$/, "").split("/").filter(Boolean);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

/** Package parts linked from the root by relationship type suffix, e.g. "/core-properties". */
async function rootPart(zip: JSZip, typeSuffix: string): Promise<string | undefined> {
  const rels = await read(zip, "_rels/.rels");
  if (!rels) return undefined;
  const rel = parseRels(rels).find((r) => r.type.endsWith(typeSuffix) && !r.external);
  return rel ? resolveTarget("_rels/.rels", rel.target) : undefined;
}

/** Remove a part plus every relationship and content-type override that points to it, so the package stays valid. */
async function removePart(zip: JSZip, path: string) {
  zip.remove(path);
  const own = path.replace(/([^/]+)$/, "_rels/$1.rels");
  if (zip.file(own)) zip.remove(own);
  for (const relsPath of paths(zip, /\.rels$/)) {
    const xml = await read(zip, relsPath);
    if (!xml) continue;
    const drop = parseRels(xml).filter((r) => !r.external && resolveTarget(relsPath, r.target).toLowerCase() === path.toLowerCase());
    if (drop.length) zip.file(relsPath, drop.reduce((x, r) => x.replace(r.raw, ""), xml));
  }
  const ct = await read(zip, "[Content_Types].xml");
  if (ct) {
    const next = ct.replace(/<Override\b[^>]*?\/>/g, (tag) => ((attrs(tag).PartName ?? "").toLowerCase() === `/${path}`.toLowerCase() ? "" : tag));
    if (next !== ct) zip.file("[Content_Types].xml", next);
  }
}

const CORE_LABELS: Record<string, { label: string; sensitive?: boolean; date?: boolean }> = {
  creator: { label: "author", sensitive: true },
  lastModifiedBy: { label: "lastSavedBy", sensitive: true },
  created: { label: "created", date: true },
  modified: { label: "modified", date: true },
  lastPrinted: { label: "lastPrinted", date: true },
  revision: { label: "revision" },
  title: { label: "title" },
  subject: { label: "subject" },
  keywords: { label: "keywords" },
  description: { label: "comments", sensitive: true },
  category: { label: "category" },
  contentStatus: { label: "status" },
  identifier: { label: "identifier" },
  language: { label: "language" },
  version: { label: "version" },
};

const APP_LABELS: Record<string, { label: string; sensitive?: boolean }> = {
  Company: { label: "company", sensitive: true },
  Manager: { label: "manager", sensitive: true },
  HyperlinkBase: { label: "linkBase", sensitive: true },
  Template: { label: "template" },
  TotalTime: { label: "editingTime" },
  Application: { label: "application" },
  AppVersion: { label: "appVersion" },
};

async function inspectOffice(zip: JSZip, kind: DocKind): Promise<DocInspection> {
  const items: DocItem[] = [];
  const flags: DocFlag[] = [];

  // --- docProps/core.xml
  const corePath = (await rootPart(zip, "/core-properties")) ?? "docProps/core.xml";
  const core = await read(zip, corePath);
  if (core) {
    for (const [name, meta] of Object.entries(CORE_LABELS)) {
      const raw = element(core, name);
      const value = raw === undefined ? "" : stripTags(raw);
      if (!value || value === NEUTRAL_DATE) continue;
      items.push({ group: "Core", label: meta.label, ...(meta.date ? dateItem(new Date(value)) : { value }), sensitive: meta.sensitive });
    }
  }

  // --- docProps/app.xml
  const appPath = (await rootPart(zip, "/extended-properties")) ?? "docProps/app.xml";
  const app = await read(zip, appPath);
  if (app) {
    for (const [name, meta] of Object.entries(APP_LABELS)) {
      const raw = element(app, name);
      const value = raw === undefined ? "" : stripTags(raw);
      if (!value || (name === "TotalTime" && value === "0")) continue;
      const shown: Pick<DocItem, "value" | "code" | "n"> = name === "TotalTime" ? { value, code: "minutes", n: Number(value) || 0 } : { value };
      const sensitive = meta.sensitive || (name === "Template" && !/^normal(\.dotm?)?$|^blank/i.test(value));
      items.push({ group: "App", label: meta.label, ...shown, sensitive });
    }
  }

  // --- docProps/custom.xml
  const customPath = await rootPart(zip, "/custom-properties");
  const custom = customPath ? await read(zip, customPath) : undefined;
  if (custom) {
    for (const m of custom.matchAll(/<(?:\w+:)?property\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?property>/g)) {
      const name = attrs(m[1]).name ?? "Property";
      const value = stripTags(m[2]);
      items.push({ group: "Custom", label: name, custom: true, value, code: value ? undefined : "empty", sensitive: true });
    }
  }

  // --- thumbnail
  const thumb = await rootPart(zip, "/metadata/thumbnail");
  if (thumb && zip.file(thumb)) items.push({ group: "Thumb", label: "thumbnail", value: "", code: "thumbnail", sensitive: true });

  if (kind === "docx") await inspectDocx(zip, items, flags);
  if (kind === "xlsx") await inspectXlsx(zip, items, flags);
  if (kind === "pptx") await inspectPptx(zip, items, flags);

  if (paths(zip, /(^|\/)vbaProject\.bin$/).length) {
    flags.push({ id: "macros", code: "macros" });
  }

  return { kind, items, flags };
}

async function inspectDocx(zip: JSZip, items: DocItem[], flags: DocFlag[]) {
  const doc = (await read(zip, "word/document.xml")) ?? "";

  const comments = await read(zip, "word/comments.xml");
  if (comments) {
    const tags = [...comments.matchAll(/<w:comment\b[^>]*>/g)].map((m) => attrs(m[0]));
    if (tags.length) {
      items.push({ group: "Notes", label: "commentAuthors", ...named(list(tags.map((t) => t["w:author"] ?? ""))), sensitive: true });
      flags.push({ id: "comments", code: "docxComments", n: tags.length, removable: "comments" });
    }
  }

  const changes = [...doc.matchAll(/<w:(ins|del|moveFrom|moveTo)\b[^>]*>/g)].map((m): Record<string, string> & { kind: string } => ({ ...attrs(m[0]), kind: m[1] }));
  if (changes.length) {
    const ins = changes.filter((c) => c.kind === "ins" || c.kind === "moveTo").length;
    const del = changes.length - ins;
    items.push({ group: "Track", label: "changeAuthors", ...named(list(changes.map((c) => c["w:author"] ?? ""))), sensitive: true });
    flags.push({ id: "changes", code: "docxChanges", ins, del });
  }

  const people = await read(zip, "word/people.xml");
  if (people) {
    const names = [...people.matchAll(/<w15:person\b[^>]*>/g)].map((m) => attrs(m[0])["w15:author"] ?? "");
    const ids = [...people.matchAll(/<w15:presenceInfo\b[^>]*>/g)].map((m) => attrs(m[0])["w15:userId"] ?? "");
    if (names.length) items.push({ group: "People", label: "reviewers", value: list(names), sensitive: true });
    if (ids.some(Boolean)) items.push({ group: "People", label: "accountIds", value: list(ids, 2), sensitive: true });
  }

  const settings = await read(zip, "word/settings.xml");
  const rsids = settings ? (settings.match(/<w:rsid\b/g) ?? []).length : 0;
  if (rsids) items.push({ group: "Word", label: "editSessions", value: String(rsids), code: "rsids", n: rsids });

  const settingsRels = await read(zip, "word/_rels/settings.xml.rels");
  const tpl = settingsRels && parseRels(settingsRels).find((r) => r.type.endsWith("/attachedTemplate"));
  if (tpl && /[\\/]/.test(tpl.target)) items.push({ group: "Word", label: "templatePath", value: tpl.target, sensitive: true });

  const hidden = (doc.match(/<w:vanish\s*\/>/g) ?? []).length;
  if (hidden) flags.push({ id: "hidden", code: "docxHidden" });
}

async function inspectXlsx(zip: JSZip, items: DocItem[], flags: DocFlag[]) {
  const wb = (await read(zip, "xl/workbook.xml")) ?? "";
  const abs = wb.match(/<x15ac:absPath\b[^>]*>/)?.[0];
  if (abs) {
    const url = attrs(abs).url;
    items.push({ group: "Excel", label: "savedFrom", value: url ?? "", code: url ? undefined : "present", sensitive: true });
  }
  const sharing = wb.match(/<fileSharing\b[^>]*>/)?.[0];
  const sharedBy = sharing && attrs(sharing).userName;
  if (sharedBy) items.push({ group: "Excel", label: "reservedBy", value: sharedBy, sensitive: true });

  let count = 0;
  const authors: string[] = [];
  for (const p of paths(zip, /^xl\/comments\d*\.xml$/)) {
    const xml = (await read(zip, p)) ?? "";
    count += (xml.match(/<comment\b/g) ?? []).length;
    authors.push(...[...xml.matchAll(/<author>([\s\S]*?)<\/author>/g)].map((m) => stripTags(m[1])));
  }
  for (const p of paths(zip, /^xl\/threadedComments\/.+\.xml$/)) count += ((await read(zip, p)) ?? "").match(/<threadedComment\b/g)?.length ?? 0;
  for (const p of paths(zip, /^xl\/persons\/.+\.xml$/)) {
    const tags = [...((await read(zip, p)) ?? "").matchAll(/<person\b[^>]*>/g)].map((m) => attrs(m[0]));
    authors.push(...tags.map((t) => t.displayName ?? ""));
    const ids = tags.map((t) => t.userId ?? "").filter(Boolean);
    if (ids.length) items.push({ group: "People", label: "accountIds", value: list(ids, 2), sensitive: true });
  }
  if (authors.some(Boolean)) items.push({ group: "Notes", label: "commentAuthors", value: list(authors), sensitive: true });
  if (count) flags.push({ id: "comments", code: "xlsxComments", n: count });
  if (paths(zip, /^xl\/revisions\//).length) flags.push({ id: "changes", code: "xlsxChanges" });
  const hiddenSheets = (wb.match(/<sheet\b[^>]*state="(?:hidden|veryHidden)"/g) ?? []).length;
  if (hiddenSheets) flags.push({ id: "hidden", code: "xlsxHidden", n: hiddenSheets });
}

async function inspectPptx(zip: JSZip, items: DocItem[], flags: DocFlag[]) {
  const authors: string[] = [];
  const legacy = await read(zip, "ppt/commentAuthors.xml");
  if (legacy) authors.push(...[...legacy.matchAll(/<p:cmAuthor\b[^>]*>/g)].map((m) => attrs(m[0]).name ?? ""));
  const modern = await read(zip, "ppt/authors.xml");
  if (modern) {
    const tags = [...modern.matchAll(/<(?:\w+:)?author\b[^>]*>/g)].map((m) => attrs(m[0]));
    authors.push(...tags.map((t) => t.name ?? ""));
    const ids = tags.map((t) => t.userId ?? "").filter(Boolean);
    if (ids.length) items.push({ group: "People", label: "accountIds", value: list(ids, 2), sensitive: true });
  }
  if (authors.some(Boolean)) items.push({ group: "Notes", label: "commentAuthors", value: list(authors), sensitive: true });

  let count = 0;
  for (const p of paths(zip, /^ppt\/comments\/.+\.xml$/)) count += ((await read(zip, p)) ?? "").match(/<(?:\w+:)?cm\b/g)?.length ?? 0;
  if (count) flags.push({ id: "comments", code: "pptxComments", n: count });

  let notes = 0;
  for (const p of paths(zip, /^ppt\/notesSlides\/notesSlide\d+\.xml$/)) if (/<a:t>[^<]*\S[^<]*<\/a:t>/.test((await read(zip, p)) ?? "")) notes++;
  if (notes) flags.push({ id: "notes", code: "pptxNotes", n: notes });

  let hidden = 0;
  for (const p of paths(zip, /^ppt\/slides\/slide\d+\.xml$/)) if (/<p:sld\b[^>]*\bshow="0"/.test((await read(zip, p)) ?? "")) hidden++;
  if (hidden) flags.push({ id: "hidden", code: "pptxHidden", n: hidden });
}

const CORE_CLEAN = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dcterms:created xsi:type="dcterms:W3CDTF">${NEUTRAL_DATE}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${NEUTRAL_DATE}</dcterms:modified></cp:coreProperties>`;

/** Remove `<name>…</name>` / `<name/>` (any prefix) from an XML string. */
const dropElement = (xml: string, name: string) =>
  xml.replace(new RegExp(`<((?:\\w+:)?${name})\\b[^>]*?(?:/>|>[\\s\\S]*?</\\1>)`, "g"), "");

async function rewrite(zip: JSZip, path: string, fn: (xml: string) => string) {
  const xml = await read(zip, path);
  if (xml === undefined) return;
  const next = fn(xml);
  if (next !== xml) zip.file(path, next);
}

async function cleanOffice(zip: JSZip, kind: DocKind, options: CleanOptions) {
  // Core properties: start over with only neutral dates. Author, last saved by, title, keywords, revision… all go.
  const corePath = (await rootPart(zip, "/core-properties")) ?? "docProps/core.xml";
  if (zip.file(corePath)) zip.file(corePath, CORE_CLEAN);

  // App properties: company, manager, template and link base go; editing time resets.
  const appPath = (await rootPart(zip, "/extended-properties")) ?? "docProps/app.xml";
  await rewrite(zip, appPath, (xml) =>
    ["Company", "Manager", "HyperlinkBase", "Template"]
      .reduce(dropElement, xml)
      .replace(/(<(?:\w+:)?TotalTime\b[^>]*>)[\s\S]*?(<\/(?:\w+:)?TotalTime>)/, "$10$2"),
  );

  // Custom properties and the embedded thumbnail: removed with their relationships and content types.
  const customPath = await rootPart(zip, "/custom-properties");
  if (customPath) await removePart(zip, customPath);
  const thumb = await rootPart(zip, "/metadata/thumbnail");
  if (thumb) await removePart(zip, thumb);

  if (kind === "docx") {
    // Account IDs / emails of reviewers (names stay, they label comments and changes).
    await rewrite(zip, "word/people.xml", (xml) => dropElement(xml, "presenceInfo"));
    // Revision-save IDs link documents edited in the same sessions.
    await rewrite(zip, "word/settings.xml", (xml) => dropElement(xml, "rsids"));
    for (const p of paths(zip, /^word\/[^/]+\.xml$/)) await rewrite(zip, p, (xml) => xml.replace(/\sw:rsid\w*="[^"]*"/g, ""));
    // Attached template: keep the file name, drop the folder (often C:\Users\<name>\…).
    await rewrite(zip, "word/_rels/settings.xml.rels", (xml) =>
      xml.replace(/(<Relationship\b[^>]*\/attachedTemplate"[^>]*\bTarget=")([^"]*)"/g, (_m, pre: string, target: string) => `${pre}${target.split(/[\\/]/).pop() ?? ""}"`),
    );
    if (options.removeComments) await removeDocxComments(zip);
  }

  if (kind === "xlsx") {
    await rewrite(zip, "xl/workbook.xml", (xml) =>
      xml
        .replace(/<mc:AlternateContent\b[^>]*>(?:(?!<\/mc:AlternateContent>)[\s\S])*?<x15ac:absPath\b[\s\S]*?<\/mc:AlternateContent>/g, "")
        .replace(/<x15ac:absPath\b[^>]*\/>/g, "")
        .replace(/(<fileSharing\b[^>]*\buserName=")[^"]*"/, '$1"'),
    );
    for (const p of paths(zip, /^xl\/persons\/.+\.xml$/)) {
      await rewrite(zip, p, (xml) => xml.replace(/\buserId="[^"]*"/g, 'userId=""').replace(/\bproviderId="[^"]*"/g, 'providerId="None"'));
    }
  }

  if (kind === "pptx") {
    await rewrite(zip, "ppt/authors.xml", (xml) => xml.replace(/\buserId="[^"]*"/g, 'userId=""').replace(/\bproviderId="[^"]*"/g, 'providerId="None"'));
  }

  // ZIP entry timestamps are another "last edited" clock.
  const neutral = new Date(Date.UTC(2000, 0, 1));
  zip.forEach((_p, f) => {
    f.date = neutral;
  });
}

async function removeDocxComments(zip: JSZip) {
  // Anchors in the body, headers, footers and notes. All three are empty marker elements, so removing them keeps the XML valid.
  const anchors = /<w:(commentRangeStart|commentRangeEnd|commentReference)\b[^>]*?(?:\/>|>\s*<\/w:\1>)/g;
  for (const p of paths(zip, /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/)) await rewrite(zip, p, (xml) => xml.replace(anchors, ""));
  // The comment parts themselves (comments, commentsExtended, commentsIds, commentsExtensible) with rels + content types.
  for (const p of paths(zip, /^word\/comments\w*\.xml$/)) await removePart(zip, p);
  // Reviewer list used for comment presence; optional, Word rebuilds it.
  if (zip.file("word/people.xml")) await removePart(zip, "word/people.xml");
}
