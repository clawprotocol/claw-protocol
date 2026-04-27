import { describe, expect, it } from "vitest";
import {
  PRO_UPGRADE_WAIT_COPY_BAN_SUBSTR,
  PRO_UPGRADE_WAIT_MODAL_BODY,
  PRO_UPGRADE_WAIT_MODAL_TITLE,
  PRO_UPGRADE_WAIT_REASSURANCE,
  PRO_UPGRADE_WAIT_ROTATING_LINES,
} from "./proUpgradeWaitCopy";

describe("proUpgradeWaitCopy", () => {
  it("keeps a calm, non-advice, non-rush posture in strings", () => {
    const bundle = [PRO_UPGRADE_WAIT_MODAL_TITLE, PRO_UPGRADE_WAIT_MODAL_BODY, PRO_UPGRADE_WAIT_REASSURANCE, ...PRO_UPGRADE_WAIT_ROTATING_LINES]
      .join(" ")
      .toLowerCase();
    for (const b of PRO_UPGRADE_WAIT_COPY_BAN_SUBSTR) {
      expect(bundle).not.toContain(b.toLowerCase());
    }
    expect(PRO_UPGRADE_WAIT_MODAL_TITLE).not.toMatch(/asap|immediately|hurry/i);
  });
});
