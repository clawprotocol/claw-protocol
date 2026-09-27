import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPaidProVs01PostSignHandoff,
  PAID_PRO_VS01_POST_SIGN_SESSION_KEY,
  readActivePaidProVs01PostSignHandoff,
  readPaidProVs01PostSignHandoff,
  writePaidProVs01PostSignHandoff,
  type PaidProVs01PostSignHandoffV1,
} from "./vs01PaidProPostSignHandoff";

describe("vs01PaidProPostSignHandoff", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    } as Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sample = (): PaidProVs01PostSignHandoffV1 => ({
    v: 1,
    agreementId: "ag_1",
    agreementTitle: "Test",
    vs01DocumentId: "doc_1",
    receiptId: "rcpt_1",
    receiptHashSha256: "abc",
    savedAt: "2026-01-01T00:00:00.000Z",
    signers: [
      {
        counterpartyId: "cp1",
        displayName: "Pat",
        email: "p@example.com",
        signingUrl: "https://x.example/app/esign/doc?q=1",
      },
    ],
  });

  it("writes and reads by agreement id", () => {
    writePaidProVs01PostSignHandoff(sample());
    expect(store.has(PAID_PRO_VS01_POST_SIGN_SESSION_KEY)).toBe(true);
    expect(readPaidProVs01PostSignHandoff("ag_1")?.receiptId).toBe("rcpt_1");
    expect(readPaidProVs01PostSignHandoff("other")).toBeNull();
  });

  it("clear removes session", () => {
    writePaidProVs01PostSignHandoff(sample());
    clearPaidProVs01PostSignHandoff();
    expect(readPaidProVs01PostSignHandoff("ag_1")).toBeNull();
  });

  it("reads the active session handoff without an agreement id", () => {
    writePaidProVs01PostSignHandoff(sample());
    expect(readActivePaidProVs01PostSignHandoff()?.agreementId).toBe("ag_1");
    expect(readActivePaidProVs01PostSignHandoff()?.vs01DocumentId).toBe("doc_1");
  });
});
