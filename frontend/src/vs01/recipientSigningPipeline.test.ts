/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Vs01RecipientPlacedField } from "./types";
import { loadRecipientManifest, storeRecipientManifest } from "./StepReceipt";
import {
  decodeRecipientManifestParam,
  encodeRecipientManifestForUrl,
  ensureRecipientFieldDefaults,
  rebindRecipientFieldsToCounterparty,
} from "./recipientManifestUrl";

function makeField(id: string, cpId: string, type: Vs01RecipientPlacedField["type"] = "signature"): Vs01RecipientPlacedField {
  return { id, counterpartyId: cpId, type, page: 0, x: 0.1, y: 0.2, width: 0.2, height: 0.05 };
}

describe("Recipient signing pipeline — field persistence", () => {
  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("storeRecipientManifest persists to both sessionStorage and localStorage", () => {
    const fields = [makeField("f1", "cp1"), makeField("f2", "cp1")];
    storeRecipientManifest("doc_1", "cp1", fields);
    const ssRaw = sessionStorage.getItem("claw_vs01_rlink_manifest_doc_1_cp1");
    const lsRaw = localStorage.getItem("claw_vs01_rlink_ls_manifest_doc_1_cp1");
    expect(ssRaw).not.toBeNull();
    expect(lsRaw).not.toBeNull();
    expect(JSON.parse(ssRaw!)).toHaveLength(2);
    expect(JSON.parse(lsRaw!)).toHaveLength(2);
  });

  it("loadRecipientManifest returns fields from sessionStorage", () => {
    storeRecipientManifest("doc_1", "cp1", [makeField("f1", "cp1")]);
    const loaded = loadRecipientManifest("doc_1", "cp1");
    expect(loaded).toHaveLength(1);
  });

  it("loadRecipientManifest falls back to localStorage on session miss (incognito / mobile reload)", () => {
    storeRecipientManifest("doc_1", "cp1", [makeField("f1", "cp1")]);
    sessionStorage.clear();
    const loaded = loadRecipientManifest("doc_1", "cp1");
    expect(loaded).toHaveLength(1);
    expect(loaded![0].id).toBe("f1");
  });

  it("loadRecipientManifest returns null when both stores are empty", () => {
    expect(loadRecipientManifest("missing", "cp1")).toBeNull();
  });
});

describe("Recipient signing pipeline — manifest hydration", () => {
  it("encodeRecipientManifestForUrl round-trips assignment metadata", () => {
    const fields: Vs01RecipientPlacedField[] = [
      {
        ...makeField("f1", "cp1"),
        assignedSignerRoleId: "vs01r:abc:i1:cp1",
        assignedPartyIndex: 1,
        assignmentSource: "active_role_selector",
      },
    ];
    const encoded = encodeRecipientManifestForUrl(fields);
    const decoded = decodeRecipientManifestParam(encoded);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.fields[0].assignedSignerRoleId).toBe("vs01r:abc:i1:cp1");
      expect(decoded.fields[0].assignmentSource).toBe("active_role_selector");
    }
  });

  it("encodeRecipientManifestForUrl round-trips through decodeRecipientManifestParam", () => {
    const fields = [makeField("f1", "cp1"), makeField("f2", "cp1", "printed_name")];
    const encoded = encodeRecipientManifestForUrl(fields);
    const decoded = decodeRecipientManifestParam(encoded);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.fields).toHaveLength(2);
      expect(decoded.fields[0].id).toBe("f1");
      expect(decoded.fields[1].type).toBe("printed_name");
    }
  });

  it("decoding invalid base64 returns error without crashing", () => {
    const result = decodeRecipientManifestParam("!!!invalid!!!");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("could not be read");
  });

  it("decoding empty string returns ok with zero fields", () => {
    const result = decodeRecipientManifestParam("");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.fields).toHaveLength(0);
  });
});

describe("Recipient signing pipeline — ownership mapping", () => {
  it("rebindRecipientFieldsToCounterparty forces all fields to locked signer id", () => {
    const fields = [makeField("f1", "old_cp_1"), makeField("f2", "old_cp_2")];
    const rebound = rebindRecipientFieldsToCounterparty(fields, "target_cp");
    expect(rebound.every((f) => f.counterpartyId === "target_cp")).toBe(true);
  });

  it("rebindRecipientFieldsToCounterparty handles empty id gracefully", () => {
    const fields = [makeField("f1", "cp1")];
    const rebound = rebindRecipientFieldsToCounterparty(fields, "");
    expect(rebound[0].counterpartyId).toBe("cp1");
  });
});

describe("Recipient signing pipeline — multi-signer routing", () => {
  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("different counterparties get isolated manifests", () => {
    const fieldsA = [makeField("a1", "cp_a"), makeField("a2", "cp_a")];
    const fieldsB = [makeField("b1", "cp_b")];
    storeRecipientManifest("doc_x", "cp_a", fieldsA);
    storeRecipientManifest("doc_x", "cp_b", fieldsB);
    const loadedA = loadRecipientManifest("doc_x", "cp_a");
    const loadedB = loadRecipientManifest("doc_x", "cp_b");
    expect(loadedA).toHaveLength(2);
    expect(loadedB).toHaveLength(1);
    expect(loadedA![0].id).toBe("a1");
    expect(loadedB![0].id).toBe("b1");
  });

  it("ensureRecipientFieldDefaults leaves printed_name empty when signer name unknown", () => {
    const fields = [makeField("f1", "cp1", "printed_name")];
    const filled = ensureRecipientFieldDefaults(fields, "Entity LLC", "x@y.com");
    expect(filled[0].value).toBe("");
  });

  it("ensureRecipientFieldDefaults fills printed_name when signer name is known", () => {
    const fields = [makeField("f1", "cp1", "printed_name")];
    const filled = ensureRecipientFieldDefaults(fields, "Alice Jones", "alice@example.com", {
      signerName: "Alice Jones",
    });
    expect(filled[0].value).toContain("Alice");
  });

  it("ensureRecipientFieldDefaults keeps existing values intact", () => {
    const fields: Vs01RecipientPlacedField[] = [{ ...makeField("f1", "cp1", "text"), value: "Custom" }];
    const filled = ensureRecipientFieldDefaults(fields, "Name");
    expect(filled[0].value).toBe("Custom");
  });
});

describe("Recipient signing pipeline — empty-state correctness", () => {
  it("RecipientSigningView does not show 'no fields' when manifest param present but hydration missed", () => {
    const src = readFileSync(join(__dirname, "RecipientSigningView.tsx"), "utf8");
    expect(src).toContain("hydrationMiss");
    expect(src).toContain("could not be loaded");
    expect(src).not.toContain("No fields are assigned to you on this document yet");
  });

  it("RecipientSigningView uses distinct messages for genuine empty vs hydration miss", () => {
    const src = readFileSync(join(__dirname, "RecipientSigningView.tsx"), "utf8");
    expect(src).toContain("genuinelyNoFields");
    expect(src).toContain("hydrationMiss");
  });
});

describe("Recipient signing pipeline — UX (no marketing headers in signing mode)", () => {
  it("ClawProductApp uses focused RECIPIENT_SIGNING_HERO for recipient links", () => {
    const src = readFileSync(join(__dirname, "../ClawProductApp.tsx"), "utf8");
    expect(src).toContain("RECIPIENT_SIGNING_HERO");
    expect(src).not.toContain("SIGN_HERO");
    const recipientBlock = src.slice(
      src.indexOf("if (recipientSignBootstrap)"),
      src.indexOf("if (agreementSignInfo)")
    );
    expect(recipientBlock).toContain("hero={RECIPIENT_SIGNING_HERO}");
  });

  it("RECIPIENT_SIGNING_HERO does not contain generic marketing copy", () => {
    const src = readFileSync(join(__dirname, "../ClawProductApp.tsx"), "utf8");
    const heroStart = src.indexOf("const RECIPIENT_SIGNING_HERO");
    const heroEnd = src.indexOf("};", heroStart);
    const heroBlock = src.slice(heroStart, heroEnd + 2);
    expect(heroBlock).not.toContain("Send a file");
    expect(heroBlock).not.toContain("collect signatures");
    expect(heroBlock).not.toContain("Simple sending");
    expect(heroBlock).toContain("Review and sign");
  });

  it("RecipientSigningView header says 'Review and sign' without generic landing copy", () => {
    const src = readFileSync(join(__dirname, "RecipientSigningView.tsx"), "utf8");
    expect(src).toContain("Review and sign");
    expect(src).not.toContain("Sign a document");
    expect(src).not.toContain("Send a file, collect signatures");
  });

  it("recipient signing completion state exists", () => {
    const src = readFileSync(join(__dirname, "Vs01Wizard.tsx"), "utf8");
    expect(src).toContain("recipientSigningFinished");
    expect(src).toContain("vs01-recipient-signing-done");
  });

  it("recipient completion screen uses recipient-safe copy (not internal process language)", () => {
    const src = readFileSync(join(__dirname, "Vs01Wizard.tsx"), "utf8");
    expect(src).not.toContain("Saved in this session");
    expect(src).toContain("all set");
    expect(src).toMatch(/email\s+delivery/);
    expect(src).toMatch(/all signatures are\s+complete/);
  });
});

describe("Recipient signing pipeline — diagnostics", () => {
  it("vs01UrlBootstrap emits structured hydration diagnostics", () => {
    const src = readFileSync(join(__dirname, "vs01UrlBootstrap.ts"), "utf8");
    expect(src).toContain("[vs01-recipient-hydration]");
    expect(src).toContain("hydrationSource");
    expect(src).toContain("fieldCount");
    expect(src).toContain("counterpartyId");
    expect(src).toContain("manifestDecodeError");
  });

  it("vs01UrlBootstrap warns on hydration miss (zero fields despite manifest)", () => {
    const src = readFileSync(join(__dirname, "vs01UrlBootstrap.ts"), "utf8");
    expect(src).toContain("[vs01-recipient-hydration-miss]");
  });

  it("Vs01Wizard logs recipient field mismatch warning", () => {
    const src = readFileSync(join(__dirname, "Vs01Wizard.tsx"), "utf8");
    expect(src).toContain("[vs01-recipient-field-mismatch]");
    expect(src).toContain("zero_fields_despite_manifest_param");
  });
});
