import { describe, expect, it } from "vitest";
import { buildWholeDocumentRedlineViewModel } from "./wholeDocumentRedlineModel";

describe("buildWholeDocumentRedlineViewModel", () => {
  it("insert-only: receipt -> Net 30 yields visible insert segment containing Net 30", () => {
    const vm = buildWholeDocumentRedlineViewModel(
      "Invoices are due on receipt.",
      "Invoices are due Net 30.",
    );
    expect(vm.hasChanges).toBe(true);
    const inserts = vm.segments.filter((s) => s.type === "insert");
    expect(inserts.length).toBeGreaterThan(0);
    const joined = inserts.map((s) => s.text).join("");
    expect(joined).toMatch(/Net\s*30/i);
    expect(vm.stats.insertCount).toBeGreaterThanOrEqual(1);
    expect(vm.stats.deleteCount).toBeGreaterThanOrEqual(0);
  });

  it("replacement: due on receipt -> due Net 30 yields delete and insert segments", () => {
    const vm = buildWholeDocumentRedlineViewModel("due on receipt", "due Net 30");
    expect(vm.hasChanges).toBe(true);
    expect(vm.segments.some((s) => s.type === "delete")).toBe(true);
    expect(vm.segments.some((s) => s.type === "insert")).toBe(true);
  });

  it("stats include lengths and segment counts", () => {
    const vm = buildWholeDocumentRedlineViewModel("a", "ab");
    expect(vm.stats.currentLen).toBe(1);
    expect(vm.stats.proposedLen).toBe(2);
    expect(vm.stats.segmentCount).toBe(vm.segments.length);
  });
});
