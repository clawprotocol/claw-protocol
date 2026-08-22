import { describe, expect, it } from "vitest";
import {
  TRUNCATED_KEEP_SOT_MIN_LEN,
  isSubstantivePaidModelBodySoT,
} from "./premiumAcceptancePolicy";

describe("isSubstantivePaidModelBodySoT", () => {
  it("keeps any 200 model draft at the backend keep floor", () => {
    expect(isSubstantivePaidModelBodySoT({ documentTextLen: 1600 })).toBe(true);
    expect(isSubstantivePaidModelBodySoT({ documentTextLen: 4500 })).toBe(true);
    expect(isSubstantivePaidModelBodySoT({ documentTextLen: 12182 })).toBe(true);
  });

  it("does not keep a thin scrap or a hard reject", () => {
    expect(isSubstantivePaidModelBodySoT({ documentTextLen: 937 })).toBe(false);
    expect(isSubstantivePaidModelBodySoT({ documentTextLen: 12182, hardRejected: true })).toBe(false);
    expect(TRUNCATED_KEEP_SOT_MIN_LEN).toBe(1600);
  });
});
