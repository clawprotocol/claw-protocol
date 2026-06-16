/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from "vitest";
import { resolveFinalVs01CorpusOrBlock } from "./vs01SigningCorpus";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import { buildVs01SigningPacketModel } from "./buildVs01SigningPacketModel";
import { buildFullPacketManifestFromCanonicalModel } from "./vs01SigningPacketManifest";
import {
  assertRecipientCorpusMatchesPrepareSeed,
  resolveRecipientCanonicalSigningPacket,
} from "./resolveRecipientCanonicalSigningPacket";
import {
  buildVs01CanonicalPacketPortable,
  buildVs01CanonicalPacketSeed,
  decodeVs01CanonicalPacketPortable,
  encodeVs01CanonicalPacketPortable,
  storeVs01CanonicalPacketPortable,
  storeVs01CanonicalPacketSeed,
} from "./vs01CanonicalPacketSeed";
import { countRecipientSigningActions } from "./recipientSigningFieldUtils";
import { repairFinalGradeGuidedCorpus } from "../components/agreements/guidedDealCompletion/guidedFinalGradeCorpus";
import { TEST74_BAD_GUIDED_CORPUS } from "../components/agreements/guidedDealCompletion/guidedFinalGradeCorpus.fixtures";

const repairedCorpus = repairFinalGradeGuidedCorpus(TEST74_BAD_GUIDED_CORPUS, {
  authoritativePartyNames: ["Acme LLC", "Joe Smith"],
}).text;
const corpus = resolveFinalVs01CorpusOrBlock({
  agreementCorpusText: repairedCorpus,
  guidedPro: true,
  premiumComplete: repairedCorpus.length >= 1500,
}).corpus;

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_test75",
    creatorName: "Acme LLC",
    creatorEmail: "anthem@example.test",
    ownerSignerName: "Anthem H Blanchard",
    ownerSignerTitle: "Manager",
    counterparties: [{ id: "cp1", name: "Joe Smith", email: "joe@example.test", signerName: "Joe Smith" }],
  });
}

describe("recipient canonical signing packet (test75)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("RecipientSigningView uses canonical render when seed exists", () => {
    const src = readFileSync(join(__dirname, "RecipientSigningView.tsx"), "utf8");
    expect(src).toContain("vs01-recipient-canonical-render");
    expect(src).toContain("useCanonicalDocument");
    expect(src).toContain("resolveRecipientCanonicalSigningPacket");
    expect(src).toContain("Vs01CanonicalSigningPage");
    expect(src).toContain("logVs01RecipientCanonicalSource");
  });

  it("prepare and recipient resolve the same corpus hash from stored seed", () => {
    const r = roles();
    const seed = buildVs01CanonicalPacketSeed({
      documentId: "doc_t75",
      agreementId: "ag_test75",
      corpusPlain: corpus,
    });
    expect(seed).not.toBeNull();
    storeVs01CanonicalPacketSeed(seed!);
    const resolved = resolveRecipientCanonicalSigningPacket({
      documentId: "doc_t75",
      agreementId: "ag_test75",
      roles: r,
    });
    expect(resolved?.corpusHash).toBe(seed!.corpusHash);
    expect(assertRecipientCorpusMatchesPrepareSeed({
      prepareCorpusPlain: corpus,
      recipientCorpusPlain: resolved!.seed.corpusPlain,
    })).toBe(true);
    expect(resolved!.model.pages.some((p) => p.flowLines.some((l) => /\bIN WITNESS WHEREOF\b/i.test(l)))).toBe(
      true,
    );
  });

  it("portable packet alone resolves canonical model without standalone seed storage", () => {
    const r = roles();
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: corpus,
      roles: r,
    });
    expect(model.allowed).toBe(true);
    const manifest = buildFullPacketManifestFromCanonicalModel({ model, roles: r });
    const witnessPageIndex = model.pages.findIndex((p) =>
      p.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)),
    );
    const seed = buildVs01CanonicalPacketSeed({
      documentId: "doc_portable_only",
      agreementId: "ag_test75",
      corpusPlain: corpus,
    })!;
    const portable = buildVs01CanonicalPacketPortable({
      seed,
      fields: manifest,
      roles: r,
      pageCount: model.pages.length,
      witnessPageIndex,
    });
    storeVs01CanonicalPacketPortable("doc_portable_only", portable);
    const resolved = resolveRecipientCanonicalSigningPacket({
      documentId: "doc_portable_only",
      agreementId: "ag_test75",
      roles: r,
      portablePacket: portable,
    });
    expect(resolved?.seedSource).toBe("portable_packet");
    expect(resolved?.model.pages).toHaveLength(model.pages.length);
  });

  it("cross-device payload restores seed and manifest after browser storage is cleared", () => {
    const r = roles();
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: corpus,
      roles: r,
    });
    expect(model.allowed).toBe(true);
    const manifest = buildFullPacketManifestFromCanonicalModel({ model, roles: r });
    const witnessPageIndex = model.pages.findIndex((p) =>
      p.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)),
    );
    const seed = buildVs01CanonicalPacketSeed({
      documentId: "doc_cross_device",
      agreementId: "ag_test75",
      corpusPlain: corpus,
    })!;
    const encoded = encodeVs01CanonicalPacketPortable(
      buildVs01CanonicalPacketPortable({
        seed,
        fields: manifest,
        roles: r,
        pageCount: model.pages.length,
        witnessPageIndex,
      }),
    );

    sessionStorage.clear();
    localStorage.clear();
    const decoded = decodeVs01CanonicalPacketPortable(encoded)!;
    storeVs01CanonicalPacketSeed(decoded.seed);
    const resolved = resolveRecipientCanonicalSigningPacket({
      documentId: "doc_cross_device",
      agreementId: "ag_test75",
      roles: r,
    });

    expect(resolved?.corpusHash).toBe(seed.corpusHash);
    expect(decoded.fields).toHaveLength(manifest.length);
    expect(resolved?.model.pages).toHaveLength(model.pages.length);
    expect(decoded.witnessPageIndex).toBe(witnessPageIndex);
    expect(decoded.seed.corpusPlain).not.toMatch(/Draft Agreement \(non-binding template\)/i);
  });

  it("canonical manifest includes initials on body pages for each signer", () => {
    const r = roles();
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: corpus,
      roles: r,
    });
    expect(model.allowed).toBe(true);
    const manifest = buildFullPacketManifestFromCanonicalModel({ model, roles: r });
    const witnessIdx = model.pages.findIndex((p) =>
      p.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)),
    );
    const bodyPages = model.pages.filter((p) => p.pageIndex !== witnessIdx);
    for (const page of bodyPages) {
      const initials = manifest.filter((f) => f.type === "initials" && f.page === page.pageIndex);
      expect(initials.length).toBeGreaterThanOrEqual(2);
    }
    const party0Editable = manifest.filter(
      (f) =>
        (f.assignedPartyIndex ?? 0) === 0 &&
        (f.type === "signature" || f.type === "initials"),
    );
    expect(countRecipientSigningActions(party0Editable, { initialsEnabled: true })).toBeGreaterThan(1);
  });

  it("buildFullPacketManifestFromCanonicalModel matches geometry of model fields", () => {
    const r = roles();
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: corpus,
      roles: r,
    });
    const fromModel = buildFullPacketManifestFromCanonicalModel({ model, roles: r });
    expect(fromModel.length).toBeGreaterThanOrEqual(model.fields.length - 2);
    const sig = fromModel.find((f) => f.type === "signature" && f.assignedPartyIndex === 0);
    expect(sig?.page).toBeGreaterThanOrEqual(0);
  });
});
