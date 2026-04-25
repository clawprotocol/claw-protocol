import { describe, expect, it } from "vitest";
import {
  rejectDevContextLeakInPremiumBody,
  scanPremiumOutputForDevContextLeak,
  stripDevContextMarkersForModelRetry,
} from "./premiumOutputDevContextGuard";

describe("premiumOutputDevContextGuard", () => {
  it("flags localhost and paths", () => {
    const s = scanPremiumOutputForDevContextLeak("The API at http://localhost:3000 and Users/foo/Desktop");
    expect(s.ok).toBe(false);
    if (!s.ok) {
      expect(s.labels).toContain("localhost");
    }
  });

  it("allows normal commercial text", () => {
    expect(
      scanPremiumOutputForDevContextLeak(
        "The parties agree to a commission on cleared deposits. Governing law: Delaware. Termination: 30 days' notice.",
      ).ok,
    ).toBe(true);
  });

  it("validatePaidProOutput fails on VITE_ echo", () => {
    const r = rejectDevContextLeakInPremiumBody("Use import.meta.env.VITE_");
    expect(r.ok).toBe(false);
  });

  it("strip for retry removes leak lines", () => {
    const t = stripDevContextMarkersForModelRetry("Good line\nRun npm run dev on localhost\nEnd");
    expect(t.toLowerCase().includes("localhost")).toBe(false);
  });
});
