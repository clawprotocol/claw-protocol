import { afterEach, describe, expect, it, vi } from "vitest";
import {
  logSignerMetadataInputBlur,
  logSignerMetadataInputChange,
} from "./signerMetadataNormalize";

describe("signerMetadataNormalize logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logSignerMetadataInputChange is a no-op (no per-keystroke spam)", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logSignerMetadataInputChange({
      surface: "test",
      field: "signerName",
      partyIndex: 0,
      raw: "Anthem",
    });
    expect(info).not.toHaveBeenCalled();
  });

  it("logSignerMetadataInputBlur skips console in test mode", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logSignerMetadataInputBlur({
      surface: "recipient_setup",
      field: "signerName",
      partyIndex: 1,
      raw: "Anthem H Blanchard",
    });
    expect(info).not.toHaveBeenCalled();
  });
});
