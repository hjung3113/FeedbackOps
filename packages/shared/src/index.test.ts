import { describe, expect, it } from "vitest";
import { isForbiddenRelationType, richContentHasUnsafeInlineImage } from "./index";

describe("shared domain helpers", () => {
  it("identifies generated_voc as forbidden", () => {
    expect(isForbiddenRelationType("generated_voc")).toBe(true);
  });

  it("rejects unsafe inline images in rich content", () => {
    expect(richContentHasUnsafeInlineImage('<img src="data:image/png;base64,abc">')).toBe(true);
    expect(richContentHasUnsafeInlineImage('<img src="https://example.com/a.png">')).toBe(true);
    expect(richContentHasUnsafeInlineImage('<attachment data-id="att_1"></attachment>')).toBe(false);
  });
});
