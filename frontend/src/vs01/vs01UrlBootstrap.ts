import type { Vs01Counterparty, Vs01Step, Vs01RecipientPlacedField } from "./types";
import { VS01_PACKET_MANIFEST_SCOPE, VS01_RECIPIENT_SIGN_QUERY, loadRecipientManifest } from "./StepReceipt";
import {
  computeVs01PacketRevision,
  decodeVs01CanonicalPacketPortable,
  loadVs01CanonicalPacketPortable,
  storeVs01CanonicalPacketSeed,
  storeVs01CanonicalPacketPortable,
  type Vs01CanonicalPacketPortableV1,
  VS01_CANONICAL_PACKET_QUERY,
  VS01_CANONICAL_PACKET_STORED_QUERY,
  VS01_PACKET_REVISION_QUERY,
} from "./vs01CanonicalPacketSeed";

function packetRevisionForPortable(packet: Vs01CanonicalPacketPortableV1): string {
  return computeVs01PacketRevision({
    corpusHash: packet.seed.corpusHash,
    initialsEnabled: packet.initialsPolicy.enabled,
    fieldCount: packet.fieldCount,
  });
}
import {
  counterpartiesFromRecipientManifestFields,
  decodeRecipientManifestParam,
  ensureRecipientFieldDefaults,
  normalizeRecipientManifestCounterparties,
  VS01_RECIPIENT_MANIFEST_QUERY,
} from "./recipientManifestUrl";
import { hydrateRecipientSigningFields, stripLockedSignerEditableValuesOnHydrate } from "./recipientSigningFieldUtils";
import { scopeRecipientManifestToLockedSigner } from "./vs01RecipientFieldScope";

function newCpId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Recipient signing step (complete assigned fields), not sender field placement. */
const RECIPIENT_SIGNER_STEP = 3 as Vs01Step;

export type Vs01UrlBootstrapResult = {
  documentId: string;
  receiptId: string;
  counterparties: Vs01Counterparty[];
  step: Vs01Step;
  furthestStep: Vs01Step;
  recipientSignerMode: boolean;
  recipientLockedCounterpartyId: string;
  /** From `agreement_id` query — used with {@link recipientLockedSignerRoleId} for field scoping. */
  recipientAgreementId: string;
  /** From `signer_role_id` query — optional; legacy links omit this. */
  recipientLockedSignerRoleId: string | null;
  /** Fields from {@link VS01_RECIPIENT_MANIFEST_QUERY}, rebound to the URL counterparty id. */
  recipientHydratedFields: Vs01RecipientPlacedField[];
  /** True when the manifest query param was present (may decode to zero fields). */
  recipientManifestParamPresent: boolean;
  /** Set when the manifest param could not be decoded; do not treat as “no fields”. */
  recipientManifestDecodeError: string | null;
  /** From `packet_revision` when portable packet is stored-only in URL. */
  packetRevision: string | null;
  /** True when URL references stored canonical packet (vs01_cpacket_stored=1). */
  canonicalPacketStored: boolean;
};

let memo: Vs01UrlBootstrapResult | null | undefined;

/**
 * One-time read of VS01 deep-link query params. Clears search from the URL via replaceState
 * so reload does not re-apply; safe under React StrictMode (memoized).
 */
export function getVs01UrlBootstrap(): Vs01UrlBootstrapResult | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (memo !== undefined) {
    return memo;
  }

  const params = new URLSearchParams(window.location.search);
  const documentId = (params.get("document_id") ?? "").trim();
  const receiptId = (params.get("receipt_id") ?? "").trim();
  const idxRaw = (params.get("recipient_index") ?? params.get("recipient") ?? "").trim();
  const recipientIndex = parseInt(idxRaw, 10);

  const flagRaw = (params.get(VS01_RECIPIENT_SIGN_QUERY) ?? "").trim().toLowerCase();
  const explicitRecipientSign = flagRaw === "1" || flagRaw === "true" || flagRaw === "yes";

  if (
    !explicitRecipientSign ||
    !documentId ||
    !Number.isFinite(recipientIndex) ||
    recipientIndex < 0 ||
    idxRaw === ""
  ) {
    memo = null;
    return null;
  }

  const recipientName = (params.get("recipient_name") ?? "").trim();
  const recipientEmail = (params.get("recipient_email") ?? "").trim();
  const counterpartyIdFromUrl = (params.get("counterparty_id") ?? "").trim();
  const recipientAgreementId = (params.get("agreement_id") ?? "").trim();
  const recipientLockedSignerRoleIdRaw = (params.get("signer_role_id") ?? "").trim();
  const recipientLockedSignerRoleId = recipientLockedSignerRoleIdRaw || null;

  const lockedId = counterpartyIdFromUrl || newCpId();

  const manifestRaw = params.get(VS01_RECIPIENT_MANIFEST_QUERY);
  const manifestStored = params.get("vs01_rmanifest_stored") === "1";
  const canonicalPacketStored = params.get(VS01_CANONICAL_PACKET_STORED_QUERY) === "1";
  const packetRevisionFromUrl = (params.get(VS01_PACKET_REVISION_QUERY) ?? "").trim();
  const canonicalPacketRaw = params.get(VS01_CANONICAL_PACKET_QUERY);
  let canonicalPacket = decodeVs01CanonicalPacketPortable(canonicalPacketRaw);
  if (!canonicalPacket && canonicalPacketStored && documentId) {
    const storedPortable = loadVs01CanonicalPacketPortable(documentId);
    if (storedPortable) {
      if (!packetRevisionFromUrl || packetRevisionFromUrl === packetRevisionForPortable(storedPortable)) {
        canonicalPacket = storedPortable;
      }
    }
  }
  if (canonicalPacket) {
    storeVs01CanonicalPacketSeed(canonicalPacket.seed);
    storeVs01CanonicalPacketPortable(documentId, canonicalPacket);
  }
  const portableRoles = canonicalPacket?.roles;
  const recipientManifestParamPresent =
    manifestRaw !== null ||
    manifestStored ||
    canonicalPacketRaw !== null ||
    canonicalPacketStored;

  let recipientHydratedFields: Vs01RecipientPlacedField[] = [];
  let recipientManifestDecodeError: string | null = null;
  let hydrationSource: "url_manifest" | "stored_manifest" | "none" = "none";

  if (manifestRaw) {
    const decoded = decodeRecipientManifestParam(manifestRaw);
    if (decoded.ok) {
      const scoped = scopeRecipientManifestToLockedSigner({
        fields: decoded.fields,
        lockedCounterpartyId: lockedId,
        lockedSignerRoleId: recipientLockedSignerRoleId,
        portableRoles,
      });
      const normalized = normalizeRecipientManifestCounterparties(scoped, lockedId);
      const cps = counterpartiesFromRecipientManifestFields(
        normalized,
        lockedId,
        recipientName || "Recipient",
        recipientEmail,
      );
      const cpMap = new Map(cps.map((c) => [c.id, c]));
      recipientHydratedFields = hydrateRecipientSigningFields(
        stripLockedSignerEditableValuesOnHydrate(
          ensureRecipientFieldDefaults(
            normalized,
            recipientName || "Recipient",
            recipientEmail || undefined,
            { signerName: cps.find((c) => c.id === lockedId)?.signerName },
          ),
          recipientAgreementId,
          recipientLockedSignerRoleId,
        ),
        cpMap,
      );
      hydrationSource = "url_manifest";
    } else {
      recipientManifestDecodeError = decoded.error;
    }
  } else if (canonicalPacket?.fields.length) {
    const manifestFields = canonicalPacket.initialsPolicy.enabled
      ? canonicalPacket.fields
      : canonicalPacket.fields.filter((f) => f.type !== "initials");
    const scoped = scopeRecipientManifestToLockedSigner({
      fields: manifestFields,
      lockedCounterpartyId: lockedId,
      lockedSignerRoleId: recipientLockedSignerRoleId,
      portableRoles,
    });
    const normalized = normalizeRecipientManifestCounterparties(scoped, lockedId);
    const cps = counterpartiesFromRecipientManifestFields(
      normalized,
      lockedId,
      recipientName || "Recipient",
      recipientEmail,
    );
    const cpMap = new Map(cps.map((c) => [c.id, c]));
    recipientHydratedFields = hydrateRecipientSigningFields(
      stripLockedSignerEditableValuesOnHydrate(
        ensureRecipientFieldDefaults(
          normalized,
          recipientName || "Recipient",
          recipientEmail || undefined,
          { signerName: cps.find((c) => c.id === lockedId)?.signerName },
        ),
        recipientAgreementId,
        recipientLockedSignerRoleId,
      ),
      cpMap,
    );
    hydrationSource = "url_manifest";
  } else {
    const lookupId = counterpartyIdFromUrl || lockedId;
    const packetStored = loadRecipientManifest(documentId, VS01_PACKET_MANIFEST_SCOPE);
    const stored = packetStored ?? loadRecipientManifest(documentId, lookupId);
    if (stored && stored.length > 0) {
      const scoped = scopeRecipientManifestToLockedSigner({
        fields: stored,
        lockedCounterpartyId: lockedId,
        lockedSignerRoleId: recipientLockedSignerRoleId,
        portableRoles,
      });
      const normalized = normalizeRecipientManifestCounterparties(scoped, lockedId);
      const cps = counterpartiesFromRecipientManifestFields(
        normalized,
        lockedId,
        recipientName || "Recipient",
        recipientEmail,
      );
      const cpMap = new Map(cps.map((c) => [c.id, c]));
      recipientHydratedFields = hydrateRecipientSigningFields(
        stripLockedSignerEditableValuesOnHydrate(
          ensureRecipientFieldDefaults(
            normalized,
            recipientName || "Recipient",
            recipientEmail || undefined,
            { signerName: cps.find((c) => c.id === lockedId)?.signerName },
          ),
          recipientAgreementId,
          recipientLockedSignerRoleId,
        ),
        cpMap,
      );
      hydrationSource = "stored_manifest";
    }
  }

  const counterparties: Vs01Counterparty[] =
    recipientHydratedFields.length > 0
      ? counterpartiesFromRecipientManifestFields(
          recipientHydratedFields,
          lockedId,
          recipientName || "Recipient",
          recipientEmail,
        )
      : (() => {
          const legacy: Vs01Counterparty[] = [];
          for (let i = 0; i < recipientIndex; i++) {
            legacy.push({ id: newCpId(), name: "", email: "", phone: "" });
          }
          legacy.push({
            id: lockedId,
            name: recipientName || "Recipient",
            email: recipientEmail,
            phone: "",
          });
          return legacy;
        })();

  const diagEnabled =
    typeof window !== "undefined" &&
    (import.meta.env.DEV || window.localStorage?.getItem("lawdogVs01FieldDiag") === "1");

  if (diagEnabled) {
    // eslint-disable-next-line no-console
    console.info("[vs01-recipient-hydration]", {
      documentId,
      recipientIndex,
      counterpartyId: lockedId,
      fieldCount: recipientHydratedFields.length,
      hydrationSource,
      manifestParamPresent: recipientManifestParamPresent,
      manifestDecodeError: recipientManifestDecodeError,
      urlCounterpartyId: counterpartyIdFromUrl || null,
      hasAgreementId: Boolean(recipientAgreementId),
      signerRoleIdShort: recipientLockedSignerRoleId ? recipientLockedSignerRoleId.slice(0, 16) : null,
    });
  }

  if (recipientHydratedFields.length === 0 && !recipientManifestDecodeError && recipientManifestParamPresent) {
    const canServerHydrate = Boolean(recipientAgreementId);
    if (!canServerHydrate) {
      // eslint-disable-next-line no-console
      console.warn("[vs01-recipient-hydration-miss]", {
        documentId,
        counterpartyId: lockedId,
        reason: manifestRaw ? "decode_returned_empty" : "storage_miss",
        hint: "Fields were placed but could not be loaded. Recipient may see empty state.",
      });
    }
  }

  memo = {
    documentId,
    receiptId,
    counterparties,
    step: RECIPIENT_SIGNER_STEP,
    furthestStep: RECIPIENT_SIGNER_STEP,
    recipientSignerMode: true,
    recipientLockedCounterpartyId: lockedId,
    recipientAgreementId,
    recipientLockedSignerRoleId,
    recipientHydratedFields,
    recipientManifestParamPresent,
    recipientManifestDecodeError,
    packetRevision: packetRevisionFromUrl || null,
    canonicalPacketStored,
  };

  const path = window.location.pathname + window.location.hash;
  window.history.replaceState({}, "", path);

  return memo;
}
