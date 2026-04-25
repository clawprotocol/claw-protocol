import { describe, expect, it } from "vitest";
import { buildGhostClausePreviewItems } from "./FullDraftUpgradeDiffPreview";

describe("buildGhostClausePreviewItems", () => {
  it("defaults to termination, liability, and disputes when no signals", () => {
    const items = buildGhostClausePreviewItems([]);
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.id)).toEqual(["termination", "liability", "dispute"]);
  });

  it("prioritizes exit, liability, then profit, then fills from defaults", () => {
    const items = buildGhostClausePreviewItems(["profit", "exit"]);
    expect(items).toHaveLength(3);
    expect(items[0].id).toBe("exit");
    expect(items[1].id).toBe("profit");
    expect(items[2].id).toBe("termination");
  });

  it("caps at three items (exit > liability > profit before voting)", () => {
    const items = buildGhostClausePreviewItems(["exit", "liability", "voting", "profit"]);
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.id)).toEqual(["exit", "liability", "profit"]);
  });
});
