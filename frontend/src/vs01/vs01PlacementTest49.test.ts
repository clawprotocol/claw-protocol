import { describe, expect, it } from "vitest";
import {
  buildAutoSignaturePacketForAllRoles,
  removeStaleSignatureOnlyAutoplaceFields,
  signingFieldGeometryHash,
} from "./vs01AutoSignaturePacket";
import {
  buildPrepareAutoInitialsForAllRoles,
  resolvePrepareAutoInitialsPolicyForRoles,
} from "./vs01PrepareFieldPlacement";
import type { PlacedSigningField } from "./signingFields";
import {
  buildRecipientSigningDocumentFields,
  buildVs01PrepareSigningRoles,
} from "./vs01SignerFieldAssignment";
import { buildFullPacketSigningManifestFields } from "./vs01SigningPacketManifest";
import {
  buildCorpusSimulatedPageLayouts,
  findByLinePlacementsFromPageLayout,
  pageLayoutForIndex,
} from "./vs01PageTextLayout";
import { fieldOverlapsDocumentText } from "./vs01FieldGeometry";
import { normalizeGuidedProCorpusStructure } from "../components/agreements/guidedDealCompletion/guidedCanonicalCorpusNormalizer";

const TEST49_TAIL = `
IN WITNESS WHEREOF, the parties execute below.

CLIENT:
Acme LLC
By: __________________________
Name: Anthem H Blanchard
Title: Manager
Date: _________________________

SERVICE PROVIDER:
Joe Smith
By: __________________________
Name: Joe Smith
Date: _________________________
`.trim();

const TEST49_BODY = `AI Automation Services Agreement between Acme LLC and Joe Smith.

${"Provider will deliver automation services, workflows, dashboards, and support handoff. ".repeat(42)}

1. Purpose and Scope
Provider will deliver AI automation setup.

2. Fees and Payment
Invoices are due Net 30 from receipt unless a signed change order states otherwise.

3. Confidentiality
Each party will protect confidential information.

4. Ownership and Work Product
Company owns the project deliverables and work product created specifically for Company after payment.

5. Support Expectations
Provider will target 99.9% monthly uptime for production automation components.

6. Term and Termination
Either party may terminate for convenience with 30 days written notice.

7. Notices
Notices shall be sent to the addresses on the signature page.

8. Miscellaneous
This Agreement is the entire agreement between the parties.
`;

const TEST49_CORPUS = normalizeGuidedProCorpusStructure(`${TEST49_BODY}\n${TEST49_TAIL}`).text;

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_test49",
    creatorName: "Acme LLC",
    creatorEmail: "anthemhayek@gmail.com",
    ownerSignerName: "Anthem H Blanchard",
    ownerSignerTitle: "Manager",
    counterparties: [{ id: "cp1", name: "Joe Smith", email: "jsm34@gmail.com", signerName: "Joe Smith" }],
  });
}

describe("VS01 placement test49 — normalized corpus + initials policy", () => {
  it("places exactly two signature fields on witness By lines without name/title/date overlays", () => {
    const r = roles();
    const pageCount = 5;
    const layouts = buildCorpusSimulatedPageLayouts(TEST49_CORPUS, pageCount);
    const witnessPage = pageCount - 1;
    const result = buildAutoSignaturePacketForAllRoles({
      roles: r,
      pageCount,
      existingFields: [],
      ownerValueCtx: { typedName: "Anthem H Blanchard", initials: "AHB", signerEmail: "anthemhayek@gmail.com" },
      corpusText: TEST49_CORPUS,
      pageLayouts: layouts,
    });
    expect(result.mode).toBe("signature_only");
    const sigs = result.fields.filter((f) => f.type === "signature");
    expect(sigs).toHaveLength(2);
    expect(result.fields.every((f) => f.type === "signature")).toBe(true);
    expect(sigs.every((f) => f.page === witnessPage)).toBe(true);
    const by = findByLinePlacementsFromPageLayout(pageLayoutForIndex(layouts, witnessPage));
    expect(by.length).toBe(2);
    expect(sigs[0]?.x).toBeCloseTo(by[0]!.x, 2);
    expect(sigs[1]?.x).toBeCloseTo(by[1]!.x, 2);
  });

  it("applies deterministic initials policy without alternating page pattern", () => {
    const r = roles();
    const pageCount = 5;
    const layouts = buildCorpusSimulatedPageLayouts(TEST49_CORPUS, pageCount);
    const policy = resolvePrepareAutoInitialsPolicyForRoles({
      roles: r,
      pageCount,
      corpusText: TEST49_CORPUS,
      pageLayouts: layouts,
    });
    expect(["placed_all_eligible", "suppressed_document_wide"]).toContain(policy.mode);
  if (policy.mode === "placed_all_eligible") {
      const initials = buildPrepareAutoInitialsForAllRoles({
        roles: r,
        pageCount,
        skippedSlots: new Set(),
        existingFields: [],
        valueCtxForRole: (role) => ({
          typedName: role.signerName ?? role.entityName,
          initials: role.partyIndex === 0 ? "AHB" : "JS",
          signerEmail: role.signerEmail,
        }),
        corpusText: TEST49_CORPUS,
        pageLayouts: layouts,
      });
      const pagesByRole = new Map<string, Set<number>>();
      for (const f of initials) {
        const rid = f.assignedSignerRoleId ?? "";
        if (!pagesByRole.has(rid)) pagesByRole.set(rid, new Set());
        pagesByRole.get(rid)!.add(f.page);
      }
      for (const role of r) {
        const pages = pagesByRole.get(role.roleId) ?? new Set();
        for (const p of policy.eligiblePages) {
          expect(pages.has(p)).toBe(true);
        }
        for (const p of policy.skippedPages) {
          expect(pages.has(p)).toBe(false);
        }
      }
      const ownerRects = initials.filter((f) => f.assignedPartyIndex === 0);
      expect(ownerRects.length).toBeGreaterThanOrEqual(4);
      expect(new Set(ownerRects.map((f) => f.page)).size).toBeGreaterThanOrEqual(4);
    }
  });

  it("does not place initials over body text when policy places them", () => {
    const r = roles();
    const pageCount = 5;
    const layouts = buildCorpusSimulatedPageLayouts(TEST49_CORPUS, pageCount);
    const policy = resolvePrepareAutoInitialsPolicyForRoles({
      roles: r,
      pageCount,
      corpusText: TEST49_CORPUS,
      pageLayouts: layouts,
    });
    if (policy.mode !== "placed_all_eligible") return;
    const initials = buildPrepareAutoInitialsForAllRoles({
      roles: r,
      pageCount,
      skippedSlots: new Set(),
      existingFields: [],
      valueCtxForRole: (role) => ({
        typedName: role.signerName ?? role.entityName,
        initials: "AB",
        signerEmail: role.signerEmail,
      }),
      corpusText: TEST49_CORPUS,
      pageLayouts: layouts,
    });
    for (const f of initials) {
      const layout = pageLayoutForIndex(layouts, f.page);
      const obstacles = (layout?.textRects ?? [])
        .filter((rect) => rect.kind === "body")
        .map((rect) => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }));
      expect(fieldOverlapsDocumentText(f, obstacles)).toBe(false);
    }
  });

  it("prepare and recipient signing geometry hashes match", () => {
    const r = roles();
    const owner = r[0]!;
    const pageCount = 5;
    const layouts = buildCorpusSimulatedPageLayouts(TEST49_CORPUS, pageCount);
    const packet = buildAutoSignaturePacketForAllRoles({
      roles: r,
      pageCount,
      existingFields: [],
      ownerValueCtx: { typedName: "Anthem H Blanchard", initials: "AHB", signerEmail: "anthemhayek@gmail.com" },
      corpusText: TEST49_CORPUS,
      pageLayouts: layouts,
    });
    const manifest = buildFullPacketSigningManifestFields({
      ownerRole: owner,
      roles: r,
      senderPlacedFields: packet.fields,
      recipientPlacedFields: [],
    });
    const recipientView = buildRecipientSigningDocumentFields({
      ownerRole: owner,
      roles: r,
      recipientPlacedFields: [],
      senderPlacedFields: manifest,
    });
    expect(signingFieldGeometryHash(manifest)).toBe(signingFieldGeometryHash(recipientView));
  });

  it("strips stale non-signature autoplace when refreshing signature_only packet", () => {
    const stale: PlacedSigningField = {
      id: "stale",
      type: "printed_name",
      page: 0,
      x: 0.2,
      y: 0.5,
      width: 0.3,
      height: 0.04,
      value: "",
      assignmentSource: "autoplace",
      assignedPartyIndex: 0,
      assignedPartyId: "owner",
      assignedSignerRoleId: "role-owner",
      assignedSignerRoleKind: "owner",
      assignedSignerRoleLabel: "Owner",
    };
    const cleaned = removeStaleSignatureOnlyAutoplaceFields([stale]);
    expect(cleaned).toHaveLength(0);
  });
});
