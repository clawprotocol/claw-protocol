/**
 * Commercial-release integrity: VS01 witness/signature tail is a derived signing-envelope
 * artifact, not a post-acceptance mutation of the customer-accepted SoT.
 *
 * Deleted-probe coverage mapping:
 * - `_probeSharedPacketAnchors.test.ts` (2-role + SoT → anchors/packetReady):
 *   covered by "building a signing packet never changes accepted SoT" + two-role
 *   envelope derivation + existing `vs01PrepareBridgeCorpus.test.ts` packet-ready path.
 * - `_probeThreeRoleAnchors.test.ts` (3-role + 2-line SoT → rebuild/packetReady):
 *   covered by "changing only derived witness/signature tail changes packet digest" and
 *   `vs01PrepareBridgeCorpus.test.ts` "rebuilds witness anchors when prepare roles exceed…".
 * - `_j7PacketProbe.test.ts` (temporary shared-body readiness probe):
 *   superseded by this provenance suite + prepare-bridge rebuild test.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
  hashPaidProCorpus,
  hydratePaidProSourceOfTruth,
} from "../components/agreements/paidProSourceOfTruth";
import { SHARED_ACCEPTED_PAID_BODY } from "../components/agreements/paidProSharedFixtureSystem";
import { fingerprintAgreementBody } from "../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";
import { sha256Hex } from "../utils/agreements/hash";
import {
  buildVs01SigningPacketModel,
  deriveVs01PacketLayoutCorpus,
} from "./buildVs01SigningPacketModel";
import { buildPrepareBridgeCorpusGateArgs } from "./vs01PrepareBridgeCorpus";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import {
  buildVs01SigningEnvelopeProvenance,
  canonicalizePrepareRolesForEnvelope,
  evaluatePublicVerifyEnvelopeLinkage,
  verifyEnvelopeLinksAcceptedSoT,
  verifyEnvelopePacketDerivation,
  VS01_SIGNING_ENVELOPE_SCHEMA_VERSION,
} from "./vs01SigningEnvelopeProvenance";

function twoRoles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_env_prov",
    creatorName: "Red Mesa Logistics LLC",
    creatorEmail: "owner@example.test",
    ownerSignerName: "Sarah Mitchell",
    ownerSignerTitle: "CEO",
    counterparties: [
      {
        id: "cp1",
        name: "Harbor Peak Automation LLC",
        email: "cp1@example.test",
        signerName: "Michael Torres",
      },
    ],
  });
}

function threeRoles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_env_prov",
    creatorName: "Red Mesa Logistics LLC",
    creatorEmail: "owner@example.test",
    ownerSignerName: "Sarah Mitchell",
    ownerSignerTitle: "CEO",
    counterparties: [
      {
        id: "cp1",
        name: "Harbor Peak Automation LLC",
        email: "cp1@example.test",
        signerName: "Michael Torres",
      },
      {
        id: "cp2",
        name: "Additional Party 3 LLC",
        email: "cp2@example.test",
        signerName: "Signer Three",
      },
    ],
  });
}

describe("VS01 signing envelope provenance (release integrity)", () => {
  beforeEach(() => {
    clearPaidProSourceOfTruth();
  });

  it("building a signing packet never changes accepted SoT bytes, length, or digest", async () => {
    const sot = SHARED_ACCEPTED_PAID_BODY.trim();
    // Rematerialize an already-accepted SoT (hydrate is not freeze authority).
    const hydrated = hydratePaidProSourceOfTruth({
      text: sot,
      source: "server_full_draft",
      agreementGenerationId: "gen_env_prov",
      reviewSessionId: "gen_env_prov",
    });
    expect(hydrated).not.toBeNull();
    expect(hasPaidProSourceOfTruth()).toBe(true);
    const beforeText = getPaidProSourceOfTruthText();
    const beforeHash = getPaidProSourceOfTruth()?.hash ?? "";
    const beforeSha = (await sha256Hex(beforeText)).toLowerCase();
    expect(beforeText).toBe(sot);
    expect(beforeHash).toBe(hashPaidProCorpus(sot));

    const roles = threeRoles();
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: sot,
      roles,
      initialsEnabled: false,
      corpusGateArgs: buildPrepareBridgeCorpusGateArgs({ agreementCorpusText: sot }),
    });
    expect(model.allowed).toBe(true);
    // Gate may normalize whitespace; model.corpus is still the accepted/gate body — never layout overlay.
    expect(model.packetLayoutCorpus.length).toBeGreaterThan(0);
    expect(model.packetLayoutCorpus).not.toBe(model.corpus);
    expect(model.packetLayoutCorpus).toContain("PARTY 3:");
    expect(model.corpus).not.toContain("PARTY 3:");

    // Packet build must not re-freeze or rewrite accepted SoT store bytes/digest.
    expect(getPaidProSourceOfTruthText()).toBe(beforeText);
    expect(getPaidProSourceOfTruth()?.hash).toBe(beforeHash);
    expect((await sha256Hex(getPaidProSourceOfTruthText())).toLowerCase()).toBe(beforeSha);
    expect(fingerprintAgreementBody(getPaidProSourceOfTruthText())).toBe(beforeHash);
  });

  it("changing only the derived witness/signature tail changes packet digest but not accepted SoT digest", async () => {
    const sot = SHARED_ACCEPTED_PAID_BODY.trim();
    const roles2 = twoRoles();
    const roles3 = threeRoles();
    const layout2 = deriveVs01PacketLayoutCorpus(sot, roles2);
    const layout3 = deriveVs01PacketLayoutCorpus(sot, roles3);
    expect(layout3).not.toBe(layout2);

    const prov2 = await buildVs01SigningEnvelopeProvenance({
      acceptedSoTPlain: sot,
      roles: roles2,
      packetLayoutCorpus: layout2,
      derivedAt: "2026-07-21T00:00:00.000Z",
    });
    const prov3 = await buildVs01SigningEnvelopeProvenance({
      acceptedSoTPlain: sot,
      roles: roles3,
      packetLayoutCorpus: layout3,
      derivedAt: "2026-07-21T00:00:00.000Z",
    });

    expect(prov2.acceptedSoTDigest).toBe(prov3.acceptedSoTDigest);
    expect(prov2.acceptedSoTLength).toBe(prov3.acceptedSoTLength);
    expect(prov2.acceptedSoTDigest).toBe((await sha256Hex(sot)).toLowerCase());
    expect(prov2.packetDigest).not.toBe(prov3.packetDigest);
    expect(prov2.packetLayoutCorpusDigest).not.toBe(prov3.packetLayoutCorpusDigest);
    expect(prov2.signerManifestDigest).not.toBe(prov3.signerManifestDigest);
    // Display fingerprint is diagnostic only and stays tied to SoT bytes.
    expect(prov2.acceptedSoTDisplayFingerprint).toBe(fingerprintAgreementBody(sot));
    expect(prov3.acceptedSoTDisplayFingerprint).toBe(prov2.acceptedSoTDisplayFingerprint);
  });

  it("changing the accepted SoT changes the packet’s recorded source digest and invalidates prior provenance", async () => {
    const sotA = SHARED_ACCEPTED_PAID_BODY.trim();
    const sotB = `${sotA}\n\nOperational addendum for provenance invalidation.`.trim();
    const roles = twoRoles();
    const provA = await buildVs01SigningEnvelopeProvenance({
      acceptedSoTPlain: sotA,
      roles,
      derivedAt: "2026-07-21T00:00:00.000Z",
    });
    const provB = await buildVs01SigningEnvelopeProvenance({
      acceptedSoTPlain: sotB,
      roles,
      derivedAt: "2026-07-21T00:00:00.000Z",
    });
    expect(provB.acceptedSoTDigest).not.toBe(provA.acceptedSoTDigest);
    expect(provB.packetDigest).not.toBe(provA.packetDigest);

    const link = await verifyEnvelopeLinksAcceptedSoT({
      provenance: provA,
      acceptedSoTPlain: sotB,
    });
    expect(link.ok).toBe(false);
    expect(link.reason).toMatch(/^accepted_sot_(length|digest)_mismatch$/);

    const derive = await verifyEnvelopePacketDerivation({
      provenance: provA,
      acceptedSoTPlain: sotB,
      roles,
    });
    expect(derive.ok).toBe(false);
  });

  it("equivalent role manifests produce deterministic packet output", async () => {
    const sot = SHARED_ACCEPTED_PAID_BODY.trim();
    const roles = threeRoles();
    const permuted = [roles[2]!, roles[0]!, roles[1]!];
    const a = await buildVs01SigningEnvelopeProvenance({
      acceptedSoTPlain: sot,
      roles,
      derivedAt: "2026-07-21T00:00:00.000Z",
    });
    const b = await buildVs01SigningEnvelopeProvenance({
      acceptedSoTPlain: sot,
      roles: permuted,
      derivedAt: "2026-07-21T00:00:00.000Z",
    });
    expect(a.signerManifestDigest).toBe(b.signerManifestDigest);
    expect(a.packetLayoutCorpusDigest).toBe(b.packetLayoutCorpusDigest);
    expect(a.packetDigest).toBe(b.packetDigest);
    expect(a.packetSchemaVersion).toBe(VS01_SIGNING_ENVELOPE_SCHEMA_VERSION);
  });

  it("role-order duplicates are rejected; canonical order is ascending partyIndex", () => {
    const roles = twoRoles();
    const dup = [...roles, { ...roles[0]!, roleId: "dup" }];
    expect(canonicalizePrepareRolesForEnvelope(dup)).toEqual({
      ok: false,
      reason: "duplicate_party_index",
    });
    const canon = canonicalizePrepareRolesForEnvelope([roles[1]!, roles[0]!]);
    expect(canon.ok).toBe(true);
    if (canon.ok) {
      expect(canon.roles.map((r) => r.partyIndex)).toEqual([0, 1]);
    }
  });

  it("public verification detects a mismatched packet/source-SoT linkage", async () => {
    const sot = SHARED_ACCEPTED_PAID_BODY.trim();
    const roles = twoRoles();
    const prov = await buildVs01SigningEnvelopeProvenance({
      acceptedSoTPlain: sot,
      roles,
      derivedAt: "2026-07-21T00:00:00.000Z",
    });
    const ok = await evaluatePublicVerifyEnvelopeLinkage({
      provenance: prov,
      claimedAcceptedSoTDigest: prov.acceptedSoTDigest,
      acceptedSoTPlain: sot,
    });
    expect(ok.ok).toBe(true);

    const badClaim = await evaluatePublicVerifyEnvelopeLinkage({
      provenance: prov,
      claimedAcceptedSoTDigest: "0".repeat(64),
    });
    expect(badClaim.ok).toBe(false);
    expect(badClaim.reason).toBe("verify_claimed_sot_digest_mismatch");

    const badBody = await evaluatePublicVerifyEnvelopeLinkage({
      provenance: prov,
      claimedAcceptedSoTDigest: prov.acceptedSoTDigest,
      acceptedSoTPlain: `${sot}\nTAMPER`,
    });
    expect(badBody.ok).toBe(false);
    expect(badBody.reason).toMatch(/accepted_sot_/);

    const missing = await evaluatePublicVerifyEnvelopeLinkage({ provenance: null });
    expect(missing.ok).toBe(false);
    expect(missing.reason).toBe("envelope_provenance_missing");
  });

  it("model.corpus remains gate/accepted SoT while packetLayoutCorpus may rebuild witness", () => {
    const sot = SHARED_ACCEPTED_PAID_BODY.trim();
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: sot,
      roles: threeRoles(),
      initialsEnabled: false,
      corpusGateArgs: buildPrepareBridgeCorpusGateArgs({ agreementCorpusText: sot }),
    });
    expect(model.packetLayoutCorpus).toContain("PARTY 3:");
    expect(model.corpus).not.toContain("PARTY 3:");
    expect(model.corpus).not.toBe(model.packetLayoutCorpus);
    expect(model.diagnostics.signatureAnchorCount).toBeGreaterThanOrEqual(3);
  });
});
