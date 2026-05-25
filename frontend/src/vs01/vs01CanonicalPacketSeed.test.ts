/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from "vitest";
import { resolveFinalVs01CorpusOrBlock } from "./vs01SigningCorpus";
import {
  buildVs01CanonicalPacketPortable,
  buildVs01CanonicalPacketSeed,
  decodeVs01CanonicalPacketPortable,
  encodeVs01CanonicalPacketPortable,
  loadVs01CanonicalPacketSeed,
  storeVs01CanonicalPacketSeed,
} from "./vs01CanonicalPacketSeed";
import { fingerprintAgreementBody } from "../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";

describe("vs01CanonicalPacketSeed", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("round-trips corpus hash for prepare/recipient parity", () => {
    const raw = `${"Paid Pro signing corpus with witness block. ".repeat(80)}\n\nIN WITNESS WHEREOF\n\nCLIENT:\nAcme LLC\nBy: ___\nName: Anthem\nTitle: CEO\nDate: ___\n\nSERVICE PROVIDER:\nJoe Smith\nBy: ___\nName: Joe Smith\nDate: ___`;
    const corpus = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: raw,
      guidedPro: true,
      premiumComplete: true,
    }).corpus;
    const seed = buildVs01CanonicalPacketSeed({
      documentId: "doc_test75",
      agreementId: "ag_test75",
      corpusPlain: corpus,
    });
    expect(seed).not.toBeNull();
    storeVs01CanonicalPacketSeed(seed!);
    const loaded = loadVs01CanonicalPacketSeed("doc_test75");
    expect(loaded?.corpusHash).toBe(fingerprintAgreementBody(corpus));
    expect(loaded?.corpusPlain).toContain("IN WITNESS WHEREOF");
    expect(loaded?.corpusPlain).not.toMatch(/Draft Agreement \(non-binding template\)/i);
  });

  it("encodes a portable canonical packet for cross-device recipient links", () => {
    const corpus = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: `${"Portable paid Pro corpus. ".repeat(90)}\n\nIN WITNESS WHEREOF\nCLIENT:\nAcme LLC\nBy: ___\nName: Anthem\nDate: ___\n\nSERVICE PROVIDER:\nJoe Smith\nBy: ___\nName: Joe Smith\nDate: ___`,
      guidedPro: true,
      premiumComplete: true,
    }).corpus;
    const seed = buildVs01CanonicalPacketSeed({
      documentId: "doc_packet",
      agreementId: "ag_packet",
      corpusPlain: corpus,
    })!;
    const packet = buildVs01CanonicalPacketPortable({
      seed,
      pageCount: 4,
      witnessPageIndex: 3,
      fields: [
        {
          id: "f_initials",
          counterpartyId: "owner",
          type: "initials",
          page: 0,
          x: 0.7,
          y: 0.9,
          width: 0.1,
          height: 0.04,
          autoInitials: true,
        },
      ],
      roles: [],
    });
    const decoded = decodeVs01CanonicalPacketPortable(encodeVs01CanonicalPacketPortable(packet));
    expect(decoded?.seed.corpusHash).toBe(seed.corpusHash);
    expect(decoded?.fieldCount).toBe(1);
    expect(decoded?.initialsPolicy.bodyPagesOnly).toBe(true);
  });
});
