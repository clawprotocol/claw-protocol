import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  exchangeRecipientBootstrapToken,
  fetchRecipientBootstrapSessionStatus,
} from "./recipientBootstrapSessionApi";

describe("recipientBootstrapSessionApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("exchange sends token in JSON body with credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        authenticated: true,
        readiness: "session_established",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await exchangeRecipientBootstrapToken("secret-bootstrap-token");
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/recipient/bootstrap/exchange",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ token: "secret-bootstrap-token" }),
      }),
    );
  });

  it("status uses cookie session endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, authenticated: false, readiness: "unauthenticated" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const status = await fetchRecipientBootstrapSessionStatus();
    expect(status.authenticated).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/recipient/session/status",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});
