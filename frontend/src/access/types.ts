/** Plan identifiers — avoid “token” in user-facing copy. */
export type AccessTier = "free" | "standard" | "premium" | "admin";

/** Capability classes for LLM routing (no raw model names in product code). */
export type AiModelClass = "basic" | "premium";

export type UsageKind =
  | "agreements_created"
  | "revision_previews"
  | "recipient_invitations"
  | "signature_requests"
  | "verification_packets";

export type AccessFeature =
  | "create_agreement"
  | "revision_preview"
  | "recipient_invitation"
  | "signature_request"
  | "esign_flow"
  | "negotiation_assist"
  | "verification_packet"
  | "add_vs01_counterparty";

export type GateContext = {
  /** Current workspace list size when starting a new agreement. */
  activeWorkspaceAgreements?: number;
  /** Named counterparties in VS01 details (excluding blanks). */
  vs01NamedCounterpartyCount?: number;
};

export type UsageTotals = Record<UsageKind, number>;

export type TierEntitlements = {
  label: string;
  can_create_agreements: boolean;
  can_use_esign: boolean;
  /** null = unlimited */
  max_active_agreements: number | null;
  max_recipient_reviews_per_month: number | null;
  max_revision_previews_per_month: number | null;
  max_signature_requests_per_month: number | null;
  max_verification_packets_per_month: number | null;
  /** Max “other signers” rows with a name in VS01. */
  max_vs01_counterparties: number | null;
  /** Which model capability tier this plan uses for CLAW AI calls. */
  effective_ai_model_class: AiModelClass;
  can_use_premium_voice: boolean;
  can_access_public_verify_branding_controls: boolean;
};

export type GateResult = {
  allowed: boolean;
  /** Short product message when blocked or approaching. */
  message?: string;
  title?: string;
  approaching?: boolean;
};

export type EntitlementSource =
  | { id: "dev_query"; tier: AccessTier }
  | { id: "dev_local_storage"; tier: AccessTier }
  | { id: "env"; tier: AccessTier }
  | { id: "default"; tier: AccessTier }
  | { id: "future_backend"; tier: AccessTier | null }
  | { id: "future_wallet"; tier: AccessTier | null }
  | { id: "future_subscription"; tier: AccessTier | null }
  | { id: "server_subscription"; tier: AccessTier | null };
