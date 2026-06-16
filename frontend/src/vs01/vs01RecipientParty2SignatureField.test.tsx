/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { buildVs01SigningPacketModel } from "./buildVs01SigningPacketModel";
import {
  buildVs01PrepareSigningRoles,
  recipientFieldBelongsToLockedSigner,
} from "./vs01SignerFieldAssignment";
import {
  countRecipientSigningActions,
  recipientFinishGateComplete,
  recipientFinishGateEditableFields,
  stripLockedSignerEditableValuesOnHydrate,
} from "./recipientSigningFieldUtils";
import { applyVs01PortablePacketToRecipientSession } from "./vs01RecipientServerHydration";
import { hydratePortableSignerMarksForRecipientView } from "./vs01RecipientSignerMarksHydration";
import { RecipientSigningFieldOverlay } from "./RecipientSigningFieldOverlay";
import { patchSignerPacketStatus } from "./vs01SigningPacketStatusStore";
import { applySignerCompletionToPortablePacket } from "./vs01FullyExecutedSignedSnapshot";
import { resolveRecipientSigningDocumentFields } from "./vs01RecipientDocumentFields";
import { witnessBlockPartyHasFilledSignature } from "./vs01WitnessBlockSigningDate";
import type { Vs01CanonicalPacketPortableV1 } from "./vs01CanonicalPacketSeed";
import {
  buildVs01CanonicalPacketPortable,
  buildVs01CanonicalPacketSeed,
} from "./vs01CanonicalPacketSeed";
import { buildFullPacketManifestFromCanonicalModel } from "./vs01SigningPacketManifest";
import { cleanup } from "@testing-library/react";

const AG = "ag_test366";
const DOC = "doc_test366";
const OWNER_EMAIL = "owner@test.com";
const CP_EMAIL = "cp@test.com";

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: AG,
    creatorName: "Red Mesa Logistics LLC",
    creatorEmail: OWNER_EMAIL,
    ownerSignerName: "Caty Biscuit",
    ownerSignerTitle: "CEO",
    counterparties: [
      {
        id: "cp_harbor",
        name: "Harbor Peak Automation LLC",
        email: CP_EMAIL,
        signerName: "Ben Reetman",
        signerTitle: "COO",
      },
    ],
  });
}

function buildPreparedPortable(): Vs01CanonicalPacketPortableV1 {
  const corpus = `CONSULTING AND IMPLEMENTATION AGREEMENT

1. Services and Engagement Scope. Provider will deliver consulting services as described herein.

2. Deliverables and Acceptance To the extent deliverables are provided, Client will review within ten days.

${"Operational detail clause with standard commercial language and milestone acceptance criteria. ".repeat(85)}

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Red Mesa Logistics LLC
By: ______________________
Name: Caty Biscuit
Title: CEO
Date: ____________________

SERVICE PROVIDER:
Harbor Peak Automation LLC
By: ______________________
Name: Ben Reetman
Title: COO
Date: ____________________`;
  const r = roles();
  const model = buildVs01SigningPacketModel({
    mode: "guided_pro",
    authoritativeCorpusPlain: corpus,
    roles: r,
    initialsEnabled: false,
  });
  if (!model.allowed) throw new Error("model blocked");
  const manifest = buildFullPacketManifestFromCanonicalModel({ model, roles: r });
  const witnessPageIndex = model.pages.findIndex((p) =>
    p.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)),
  );
  const seed = buildVs01CanonicalPacketSeed({
    documentId: DOC,
    agreementId: AG,
    corpusPlain: corpus,
  });
  if (!seed) throw new Error("seed failed");
  return buildVs01CanonicalPacketPortable({
    seed,
    fields: manifest,
    roles: r,
    pageCount: model.pages.length,
    witnessPageIndex,
    initialsEnabled: false,
  });
}

describe("Test366 Party 2 signature field after Party 1 signs", () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it("party 1 signed portable: party 2 hydration keeps actionable signature field", () => {
    const r = roles();
    const ownerRole = r[0]!;
    const cpRole = r[1]!;
    let portable = buildPreparedPortable();

    const ownerSig = portable.fields.find(
      (f) => f.type === "signature" && f.assignedSignerRoleId === ownerRole.roleId,
    );
    expect(ownerSig).toBeTruthy();

    const applied = applySignerCompletionToPortablePacket({
      portable,
      agreementId: AG,
      documentId: DOC,
      signerRoleId: ownerRole.roleId,
      partyIndex: 0,
      signingDateIso: "2026-06-15",
      signatureText: "Caty Biscuit",
      recipientFields: portable.fields.filter((f) => f.assignedSignerRoleId === ownerRole.roleId),
    });
    portable = applied.portable;
    expect(witnessBlockPartyHasFilledSignature(portable.seed.corpusPlain, 0)).toBe(true);
    expect(witnessBlockPartyHasFilledSignature(portable.seed.corpusPlain, 1)).toBe(false);

    patchSignerPacketStatus(AG, ownerRole.roleId, "signed", r.map((x) => x.roleId));

    const hydrated = applyVs01PortablePacketToRecipientSession({
      portable,
      documentId: DOC,
      lockedCounterpartyId: cpRole.vs01CounterpartyId ?? "cp_harbor",
      lockedSignerRoleId: cpRole.roleId,
      recipientName: "Harbor Peak Automation LLC",
      recipientEmail: CP_EMAIL,
    });
    expect(hydrated.ok).toBe(true);

    const cpSig = hydrated.fields.find(
      (f) =>
        f.type === "signature" &&
        recipientFieldBelongsToLockedSigner(f, cpRole.vs01CounterpartyId ?? "cp_harbor", cpRole.roleId),
    );
    expect(cpSig).toBeTruthy();
    expect(cpSig?.value ?? "").toBe("");

    const docFields = resolveRecipientSigningDocumentFields({
      documentId: DOC,
      recipientFields: hydrated.fields,
      senderPlacedFields: [],
      prepareRoles: r,
      lockedCounterpartyId: cpRole.vs01CounterpartyId ?? "cp_harbor",
      lockedSignerRoleId: cpRole.roleId,
      canonicalModel: buildVs01SigningPacketModel({
        mode: "guided_pro",
        authoritativeCorpusPlain: portable.seed.corpusPlain,
        roles: r,
        initialsEnabled: false,
      }),
    });
    const myFields = docFields.filter((f) =>
      recipientFieldBelongsToLockedSigner(f, cpRole.vs01CounterpartyId ?? "cp_harbor", cpRole.roleId),
    );
    const editable = recipientFinishGateEditableFields(myFields, { initialsEnabled: false });
    expect(countRecipientSigningActions(editable, { initialsEnabled: false })).toBe(1);
    expect(recipientFinishGateComplete(myFields, { initialsEnabled: false })).toBe(false);

    const ownerSigField = docFields.find(
      (f) => f.type === "signature" && f.assignedSignerRoleId === ownerRole.roleId,
    )!;
    const cpById = new Map(hydrated.counterparties.map((c) => [c.id, c]));
    render(
      <RecipientSigningFieldOverlay
        field={cpSig!}
        lockedCounterpartyId={cpRole.vs01CounterpartyId ?? "cp_harbor"}
        lockedSignerRoleId={cpRole.roleId}
        recipientAgreementId={AG}
        cpById={cpById}
        onUpdateValue={() => {}}
        canonicalCompact
      />,
    );
    expect(screen.getByLabelText("Signature")).toBeTruthy();

    patchSignerPacketStatus(AG, ownerRole.roleId, "signed");
    render(
      <RecipientSigningFieldOverlay
        field={{ ...ownerSigField, value: "Caty Biscuit" }}
        lockedCounterpartyId={cpRole.vs01CounterpartyId ?? "cp_harbor"}
        lockedSignerRoleId={cpRole.roleId}
        recipientAgreementId={AG}
        cpById={cpById}
        onUpdateValue={() => {}}
        canonicalCompact
      />,
    );
    expect(screen.getByText("Caty Biscuit")).toBeTruthy();
  });

  it("hydratePortableSignerMarksForRecipientView skips viewing signer role", () => {
    const r = roles();
    let portable = buildPreparedPortable();
    const ownerRole = r[0]!;
    const cpRole = r[1]!;

    portable = applySignerCompletionToPortablePacket({
      portable,
      agreementId: AG,
      documentId: DOC,
      signerRoleId: ownerRole.roleId,
      partyIndex: 0,
      signingDateIso: "2026-06-15",
      signatureText: "Caty Biscuit",
    }).portable;

    const hydrated = hydratePortableSignerMarksForRecipientView({
      portable,
      agreementId: AG,
      documentId: DOC,
      viewingSignerRoleId: cpRole.roleId,
    });

    const cpSig = hydrated.fields.find((f) => f.assignedSignerRoleId === cpRole.roleId && f.type === "signature");
    expect(cpSig?.value ?? "").toBe("");
  });

  it("stripLockedSignerEditableValuesOnHydrate preserves prior signer signature on full manifest", () => {
    const r = roles();
    const ownerRole = r[0]!;
    const cpRole = r[1]!;
    const portable = buildPreparedPortable();
    const ownerSig = {
      ...portable.fields.find((f) => f.assignedSignerRoleId === ownerRole.roleId && f.type === "signature")!,
      value: "Caty Biscuit",
    };
    const cpSig = portable.fields.find(
      (f) => f.assignedSignerRoleId === cpRole.roleId && f.type === "signature",
    )!;
    patchSignerPacketStatus(AG, ownerRole.roleId, "signed");

    const stripped = stripLockedSignerEditableValuesOnHydrate(
      [ownerSig, cpSig],
      AG,
      cpRole.roleId,
      { hydrationSource: "server_packet" },
    );
    expect(stripped.find((f) => f.assignedSignerRoleId === ownerRole.roleId)?.value).toBe("Caty Biscuit");
    expect(stripped.find((f) => f.assignedSignerRoleId === cpRole.roleId)?.value).toBe("");
  });
});
