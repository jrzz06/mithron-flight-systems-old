import { describe, expect, it } from "vitest";
import {
  assertMediaMimeMatchesContent,
  sniffMediaMimeFromBytes
} from "@/services/media-manager";

describe("media magic-byte sniff", () => {
  it("detects common allowlisted image signatures", () => {
    expect(sniffMediaMimeFromBytes(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(
      sniffMediaMimeFromBytes(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ).toBe("image/png");
    expect(
      sniffMediaMimeFromBytes(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00]))
    ).toBe("image/gif");

    const webp = new Uint8Array(12);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(sniffMediaMimeFromBytes(webp)).toBe("image/webp");
  });

  it("returns null for inconclusive bytes (keeps declared MIME path safe)", () => {
    expect(sniffMediaMimeFromBytes(Uint8Array.from([0x00, 0x01, 0x02]))).toBeNull();
    expect(sniffMediaMimeFromBytes(new Uint8Array())).toBeNull();
  });

  it("allows matching declared MIME and rejects clear spoofing", () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(assertMediaMimeMatchesContent({ declaredMime: "image/jpeg", bytes: jpeg })).toBe("image/jpeg");
    expect(assertMediaMimeMatchesContent({ declaredMime: "image/png", bytes: Uint8Array.from([0x00]) })).toBe(
      "image/png"
    );
    expect(() =>
      assertMediaMimeMatchesContent({ declaredMime: "image/png", bytes: jpeg })
    ).toThrow(/looks like image\/jpeg/);
  });
});
