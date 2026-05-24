import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  recipientUploadError,
  recipientUploadLogSelected,
} from "./recipientDraftUploadLog";

describe("recipient revised-draft upload diagnostics privacy", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubEnv("DEV", false);
    vi.stubEnv("PROD", true);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    } as Storage);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not emit upload diagnostics in production unless explicitly enabled", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    recipientUploadLogSelected({
      name: "Jane Doe Private NDA.pdf",
      type: "application/pdf",
      size: 1234,
    });

    expect(info).not.toHaveBeenCalled();
  });

  it("when enabled, logs file extension and metadata without private file names or emails", () => {
    store.set("lawdogRecipientReviseDiag", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    recipientUploadLogSelected({
      name: "Jane Doe Private NDA.pdf",
      type: "application/pdf",
      size: 1234,
      signerEmail: "jane@example.com",
    });

    expect(info).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(info.mock.calls);
    expect(serialized).toContain("fileExt");
    expect(serialized).toContain("pdf");
    expect(serialized).not.toContain("Jane Doe");
    expect(serialized).not.toContain("jane@example.com");
  });

  it("does not log raw error messages that may contain private file names", () => {
    store.set("lawdogRecipientReviseDiag", "1");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    recipientUploadError("parse", new Error("failed on Jane Doe NDA.pdf"), {
      name: "Jane Doe NDA.pdf",
    });

    const serialized = JSON.stringify(error.mock.calls);
    expect(serialized).toContain("Error");
    expect(serialized).toContain("fileExt");
    expect(serialized).not.toContain("Jane Doe");
  });
});
