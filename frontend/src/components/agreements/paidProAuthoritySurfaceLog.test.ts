import { afterEach, describe, expect, it } from "vitest";
import {
  paidProAuthoritySurfaceLogKey,
  resetPaidProAuthoritySurfaceLogDedupeForTests,
  shouldLogPaidProAuthoritySurfaceEvent,
} from "./paidProAuthoritySurfaceLog";

const EVENT = {
  event: "paid-pro-surface",
  surface: "review",
  hash: "12885:37c1c2dd",
  source: "paidProSourceOfTruth",
};

describe("paidProAuthoritySurfaceLog", () => {
  afterEach(() => resetPaidProAuthoritySurfaceLogDedupeForTests());

  it("dedupes repeated same-hash same-surface authority logs", () => {
    expect(shouldLogPaidProAuthoritySurfaceEvent(EVENT, { dev: true, test: false })).toBe(true);
    expect(shouldLogPaidProAuthoritySurfaceEvent(EVENT, { dev: true, test: false })).toBe(false);
  });

  it("allows changed hash or surface and blocks production/test hot-path logs", () => {
    expect(shouldLogPaidProAuthoritySurfaceEvent(EVENT, { dev: false, test: false })).toBe(false);
    expect(shouldLogPaidProAuthoritySurfaceEvent(EVENT, { dev: true, test: true })).toBe(false);
    expect(shouldLogPaidProAuthoritySurfaceEvent(EVENT, { dev: true, test: false })).toBe(true);
    expect(
      shouldLogPaidProAuthoritySurfaceEvent(
        { ...EVENT, surface: "copy" },
        { dev: true, test: false },
      ),
    ).toBe(true);
    expect(
      shouldLogPaidProAuthoritySurfaceEvent(
        { ...EVENT, hash: "12886:different" },
        { dev: true, test: false },
      ),
    ).toBe(true);
  });

  it("keys by event surface hash and source", () => {
    expect(paidProAuthoritySurfaceLogKey(EVENT)).toBe(
      "paid-pro-surface:review:12885:37c1c2dd:paidProSourceOfTruth",
    );
  });
});
