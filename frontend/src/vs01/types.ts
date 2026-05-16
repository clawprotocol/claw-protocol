/** VS01 wizard step index (client-only; no router). */
export type Vs01Step = 0 | 1 | 2 | 3 | 4;

/** How the document file was added (for Details default title). */
export type Vs01DocumentIntakeSource = "upload" | "camera";

/** Payload from StepDocument finalize / clear (extends API response with client metadata). */
export type Vs01FinalizeDocumentPayload = {
  documentId: string;
  contentSha256: string;
  /** Present after successful finalize; omitted when clearing. */
  fileName?: string | null;
  source?: Vs01DocumentIntakeSource | null;
};

/** Loading axis reserved for future API wiring (shell uses "idle" only for now). */
export type Vs01LoadingState =
  | "idle"
  | "finalize"
  | "session"
  | "complete"
  | "receipt"
  | "bundle";

/** Thin agreement envelope (frontend-only orchestration; no backend envelope API yet). */
export type Vs01Counterparty = {
  id: string;
  name: string;
  email: string;
  /** Mobile / text number (optional). */
  phone?: string;
  signerName?: string;
  signerTitle?: string;
  signerEmail?: string;
  reviewEmail?: string;
};

/** Field type for recipient assignment (Step 4). `printed_name` is a fixed label; `text` / `email` are freeform (email prefills when known). */
export type Vs01RecipientFieldType = "signature" | "initials" | "printed_name" | "text" | "email" | "date";

export type Vs01SignerFieldAssignmentSource =
  | "active_role_selector"
  | "legacy"
  | "autoplace"
  | "migration";

/**
 * A field placed for a specific counterparty on the PDF (normalized coords, client-only until backend exists).
 */
export type Vs01RecipientPlacedField = {
  id: string;
  counterpartyId: string;
  type: Vs01RecipientFieldType;
  /** 0-based page index (matches API page_index). */
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  value?: string;
  /** Per-page initials for “initials on every page” for this counterparty (Step 4). */
  autoInitials?: boolean;
  assignedPartyId?: string;
  assignedPartyIndex?: number;
  assignedSignerEmail?: string;
  assignedSignerRoleId?: string;
  assignedSignerRoleLabel?: string;
  assignedSignerRoleKind?: "owner" | "counterparty";
  assignmentSource?: Vs01SignerFieldAssignmentSource;
};

/** Snapshot of sender signature UI for read-only reference on the recipient-fields step (client-only). */
export type Vs01SenderSignatureRef = {
  mode: "type" | "draw" | "upload";
  typedName: string;
  /** PNG data URL for draw/upload snapshot when available */
  imageDataUrl?: string | null;
};
