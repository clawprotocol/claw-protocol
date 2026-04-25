import { describe, expect, it } from "vitest";
import { SIMPLE_HOME_REVISION_COMPARE_ANCHOR_ID } from "./simpleHomeRevisionCompareAnchor";

describe("simpleHomeRevisionCompareAnchor", () => {
  it("uses a stable DOM id for scroll targeting after revision preview", () => {
    expect(SIMPLE_HOME_REVISION_COMPARE_ANCHOR_ID).toBe("claw-simple-home-revision-compare");
  });
});
