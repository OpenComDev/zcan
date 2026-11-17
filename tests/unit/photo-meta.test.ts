import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanPhoto } from "@/lib/photo-meta";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBP\0");
const other = new TextEncoder().encode("GIF89a");

afterEach(() => vi.unstubAllGlobals());

describe("cleanPhoto", () => {
  it.each([
    { name: "JPEG", bytes: jpeg, mime: "image/jpeg", flatten: true },
    { name: "PNG", bytes: png, mime: "image/png", flatten: false },
    { name: "WebP", bytes: webp, mime: "image/webp", flatten: false },
    { name: "other", bytes: other, mime: "image/jpeg", flatten: true },
  ])("uses the correct output and transparency for $name input", async ({ bytes, mime, flatten }) => {
    const close = vi.fn();
    const bitmap = { width: 12, height: 8, close };
    const ctx = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
    const toBlob = vi.fn((callback: BlobCallback, type: string) => callback(new Blob(["pixels"], { type })));
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => ctx), toBlob };
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
    vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });

    const output = await cleanPhoto(new Blob([bytes], { type: "application/octet-stream" }));

    expect(output.type).toBe(mime);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), mime, 0.92);
    expect(ctx.fillRect).toHaveBeenCalledTimes(flatten ? 1 : 0);
    expect(ctx.drawImage).toHaveBeenCalledWith(bitmap, 0, 0);
    expect(canvas).toMatchObject({ width: 12, height: 8 });
    expect(close).toHaveBeenCalledOnce();
  });
});
