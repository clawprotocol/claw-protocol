/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import type { PlacedSigningField } from "./signingFields";
import type { Vs01Counterparty, Vs01RecipientPlacedField } from "./types";
import {
  clearVs01DraftState,
  loadVs01DraftState,
  mergeBridgeEmailsIntoSavedCounterparties,
  saveVs01DraftState,
  type Vs01DraftState,
} from "./vs01DraftStatePersist";

function makePlacedField(overrides: Partial<PlacedSigningField> = {}): PlacedSigningField {
  return {
    id: "f1",
    type: "signature",
    page: 0,
    x: 0.3,
    y: 0.5,
    width: 0.25,
    height: 0.06,
    ...overrides,
  };
}

function makeRecipientField(overrides: Partial<Vs01RecipientPlacedField> = {}): Vs01RecipientPlacedField {
  return {
    id: "rf1",
    counterpartyId: "cp1",
    type: "signature",
    page: 0,
    x: 0.3,
    y: 0.7,
    width: 0.25,
    height: 0.06,
    ...overrides,
  };
}

function makeState(overrides: Partial<Vs01DraftState> = {}): Vs01DraftState {
  return {
    v: 1,
    documentId: "doc_test_1",
    step: 2,
    furthestStep: 2,
    agreementTitle: "Test Agreement",
    creatorName: "Owner",
    creatorEmail: "owner@test.com",
    senderMessage: "",
    counterparties: [{ id: "cp1", name: "Signer", email: "signer@test.com", phone: "" }],
    senderPlacedFields: [makePlacedField()],
    recipientPlacedFields: [makeRecipientField()],
    senderSignatureRef: { mode: "type", typedName: "Owner" },
    savedAt: Date.now(),
    ...overrides,
  };
}

describe("vs01DraftStatePersist", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("saves and loads draft state by documentId", () => {
    const state = makeState();
    saveVs01DraftState(state);
    const loaded = loadVs01DraftState("doc_test_1");
    expect(loaded).not.toBeNull();
    expect(loaded!.documentId).toBe("doc_test_1");
    expect(loaded!.senderPlacedFields).toHaveLength(1);
    expect(loaded!.senderPlacedFields[0].type).toBe("signature");
    expect(loaded!.recipientPlacedFields).toHaveLength(1);
    expect(loaded!.counterparties).toHaveLength(1);
    expect(loaded!.counterparties[0].email).toBe("signer@test.com");
    expect(loaded!.senderSignatureRef?.mode).toBe("type");
    expect(loaded!.senderSignatureRef?.typedName).toBe("Owner");
    expect(loaded!.step).toBe(2);
  });

  it("returns null for unknown documentId", () => {
    expect(loadVs01DraftState("unknown_doc")).toBeNull();
  });

  it("returns null for empty/null documentId", () => {
    expect(loadVs01DraftState("")).toBeNull();
    expect(loadVs01DraftState(null)).toBeNull();
    expect(loadVs01DraftState(undefined)).toBeNull();
  });

  it("clears saved state by documentId", () => {
    saveVs01DraftState(makeState());
    expect(loadVs01DraftState("doc_test_1")).not.toBeNull();
    clearVs01DraftState("doc_test_1", "test_clear");
    expect(loadVs01DraftState("doc_test_1")).toBeNull();
  });

  it("preserves multiple fields across save/load", () => {
    const fields: PlacedSigningField[] = [
      makePlacedField({ id: "f1", type: "signature", page: 0, x: 0.1, y: 0.2 }),
      makePlacedField({ id: "f2", type: "email", page: 0, x: 0.3, y: 0.4, value: "owner@test.com" }),
      makePlacedField({ id: "f3", type: "text", page: 1, x: 0.5, y: 0.6, value: "Custom text" }),
    ];
    saveVs01DraftState(makeState({ senderPlacedFields: fields }));
    const loaded = loadVs01DraftState("doc_test_1")!;
    expect(loaded.senderPlacedFields).toHaveLength(3);
    expect(loaded.senderPlacedFields[1].value).toBe("owner@test.com");
    expect(loaded.senderPlacedFields[2].value).toBe("Custom text");
    expect(loaded.senderPlacedFields[2].page).toBe(1);
  });

  it("different documentIds do not collide", () => {
    saveVs01DraftState(makeState({ documentId: "doc_a", agreementTitle: "A" }));
    saveVs01DraftState(makeState({ documentId: "doc_b", agreementTitle: "B" }));
    expect(loadVs01DraftState("doc_a")!.agreementTitle).toBe("A");
    expect(loadVs01DraftState("doc_b")!.agreementTitle).toBe("B");
    clearVs01DraftState("doc_a", "test");
    expect(loadVs01DraftState("doc_a")).toBeNull();
    expect(loadVs01DraftState("doc_b")).not.toBeNull();
  });

  it("rejects corrupted or version-mismatched data", () => {
    sessionStorage.setItem("claw_vs01_draft_state_v1_bad", "not json");
    expect(loadVs01DraftState("bad")).toBeNull();

    sessionStorage.setItem(
      "claw_vs01_draft_state_v1_bad2",
      JSON.stringify({ v: 99, documentId: "bad2" }),
    );
    expect(loadVs01DraftState("bad2")).toBeNull();
  });

  it("does not save when documentId is empty", () => {
    saveVs01DraftState(makeState({ documentId: "" }));
    expect(sessionStorage.length).toBe(0);
  });
});

describe("vs01DraftStatePersist — refresh persistence", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("saved senderPlacedFields survive a simulated refresh (save then immediate load)", () => {
    const fields: PlacedSigningField[] = [
      makePlacedField({ id: "sig1", type: "signature", page: 0, x: 0.2, y: 0.3 }),
      makePlacedField({ id: "email1", type: "email", page: 0, x: 0.4, y: 0.5, value: "test@example.com" }),
      makePlacedField({ id: "date1", type: "date", page: 1, x: 0.1, y: 0.9, value: "2026-05-11" }),
    ];
    saveVs01DraftState(makeState({ senderPlacedFields: fields }));

    const loaded = loadVs01DraftState("doc_test_1");
    expect(loaded).not.toBeNull();
    expect(loaded!.senderPlacedFields).toHaveLength(3);
    expect(loaded!.senderPlacedFields[0].id).toBe("sig1");
    expect(loaded!.senderPlacedFields[1].value).toBe("test@example.com");
    expect(loaded!.senderPlacedFields[2].value).toBe("2026-05-11");
    expect(loaded!.senderPlacedFields[2].page).toBe(1);
  });

  it("bridge flow: saved state with fields is not overwritten by bridge session presence", () => {
    const savedFields: PlacedSigningField[] = [
      makePlacedField({ id: "f1", type: "signature", page: 0 }),
      makePlacedField({ id: "f2", type: "text", page: 0, value: "Important clause" }),
    ];
    const savedCps: Vs01Counterparty[] = [
      { id: "cp1", name: "Recipient", email: "recip@saved.com", phone: "" },
    ];
    saveVs01DraftState(makeState({
      senderPlacedFields: savedFields,
      counterparties: savedCps,
      step: 2,
      furthestStep: 2,
    }));

    const bridgeCps: Vs01Counterparty[] = [
      { id: "cp1", name: "Recipient", email: "recip@bridge.com", phone: "" },
    ];

    const saved = loadVs01DraftState("doc_test_1");
    expect(saved).not.toBeNull();
    expect(saved!.senderPlacedFields).toHaveLength(2);
    expect(saved!.senderPlacedFields[0].id).toBe("f1");
    expect(saved!.senderPlacedFields[1].value).toBe("Important clause");

    const mergedCps = mergeBridgeEmailsIntoSavedCounterparties(
      saved!.counterparties,
      bridgeCps,
    );
    expect(mergedCps[0].email).toBe("recip@saved.com");
  });

  it("bridge flow: blank emails in saved state are filled from bridge counterparties", () => {
    const savedCps: Vs01Counterparty[] = [
      { id: "cp1", name: "Recipient", email: "", phone: "" },
    ];
    saveVs01DraftState(makeState({
      senderPlacedFields: [makePlacedField()],
      counterparties: savedCps,
    }));

    const bridgeCps: Vs01Counterparty[] = [
      { id: "cp1", name: "Recipient", email: "filled@bridge.com", phone: "" },
    ];

    const saved = loadVs01DraftState("doc_test_1")!;
    const mergedCps = mergeBridgeEmailsIntoSavedCounterparties(
      saved.counterparties,
      bridgeCps,
    );
    expect(mergedCps[0].email).toBe("filled@bridge.com");
    expect(saved.senderPlacedFields).toHaveLength(1);
  });

  it("clearVs01DraftState only removes specified documentId", () => {
    saveVs01DraftState(makeState({ documentId: "doc_keep" }));
    saveVs01DraftState(makeState({ documentId: "doc_remove" }));
    clearVs01DraftState("doc_remove", "test");
    expect(loadVs01DraftState("doc_keep")).not.toBeNull();
    expect(loadVs01DraftState("doc_remove")).toBeNull();
  });

  it("fields with positions and dimensions round-trip exactly", () => {
    const fields: PlacedSigningField[] = [
      makePlacedField({ id: "precise", x: 0.12345, y: 0.67891, width: 0.234, height: 0.0456 }),
    ];
    saveVs01DraftState(makeState({ senderPlacedFields: fields }));
    const loaded = loadVs01DraftState("doc_test_1")!;
    expect(loaded.senderPlacedFields[0].x).toBeCloseTo(0.12345, 10);
    expect(loaded.senderPlacedFields[0].y).toBeCloseTo(0.67891, 10);
    expect(loaded.senderPlacedFields[0].width).toBeCloseTo(0.234, 10);
    expect(loaded.senderPlacedFields[0].height).toBeCloseTo(0.0456, 10);
  });
});

describe("mergeBridgeEmailsIntoSavedCounterparties", () => {
  it("fills blank saved email from bridge without overwriting existing", () => {
    const saved: Vs01Counterparty[] = [
      { id: "cp1", name: "Signer", email: "kept@existing.com", phone: "" },
      { id: "cp2", name: "Other", email: "", phone: "" },
    ];
    const bridge: Vs01Counterparty[] = [
      { id: "cp1", name: "Signer", email: "bridge@new.com", phone: "" },
      { id: "cp2", name: "Other", email: "other@bridge.com", phone: "" },
    ];
    const merged = mergeBridgeEmailsIntoSavedCounterparties(saved, bridge);
    expect(merged[0].email).toBe("kept@existing.com");
    expect(merged[1].email).toBe("other@bridge.com");
  });

  it("handles bridge shorter than saved", () => {
    const saved: Vs01Counterparty[] = [
      { id: "cp1", name: "A", email: "", phone: "" },
      { id: "cp2", name: "B", email: "", phone: "" },
    ];
    const bridge: Vs01Counterparty[] = [
      { id: "cp1", name: "A", email: "a@b.com", phone: "" },
    ];
    const merged = mergeBridgeEmailsIntoSavedCounterparties(saved, bridge);
    expect(merged[0].email).toBe("a@b.com");
    expect(merged[1].email).toBe("");
  });

  it("does not modify saved when both have empty emails", () => {
    const saved: Vs01Counterparty[] = [
      { id: "cp1", name: "A", email: "", phone: "" },
    ];
    const bridge: Vs01Counterparty[] = [
      { id: "cp1", name: "A", email: "", phone: "" },
    ];
    const merged = mergeBridgeEmailsIntoSavedCounterparties(saved, bridge);
    expect(merged[0].email).toBe("");
  });

  it("returns new array (does not mutate input)", () => {
    const saved: Vs01Counterparty[] = [
      { id: "cp1", name: "A", email: "", phone: "" },
    ];
    const bridge: Vs01Counterparty[] = [
      { id: "cp1", name: "A", email: "x@y.com", phone: "" },
    ];
    const merged = mergeBridgeEmailsIntoSavedCounterparties(saved, bridge);
    expect(merged).not.toBe(saved);
    expect(saved[0].email).toBe("");
  });
});
