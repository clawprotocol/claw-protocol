import { useState } from "react";
import {
  logSignerMetadataInputBlur,
  logSignerMetadataNormalizedForSave,
  normalizeSignerMetadataForSave,
  signerMetadataInputRaw,
} from "../agreement/signerMetadataNormalize";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import { isKnownPrepareSignerName, resolvePreparePartyEntityLabel } from "./vs01PrepareSignerDisplay";
import { resolvePrepareSignerMetadataPanelTitle } from "./vs01SignerIdentityUx";

export type Vs01PrepareSignerMetadataPanelProps = {
  role: Vs01PrepareSigningRole;
  busy?: boolean;
  onPatch: (patch: { signerName?: string; signerTitle?: string }) => void;
};

export function Vs01PrepareSignerMetadataPanel({
  role,
  busy = false,
  onPatch,
}: Vs01PrepareSignerMetadataPanelProps) {
  const party = resolvePreparePartyEntityLabel(role);
  const known = isKnownPrepareSignerName(role);
  const panelCopy = resolvePrepareSignerMetadataPanelTitle(role);
  const signerName = signerMetadataInputRaw(role.signerName);
  const signerTitle = signerMetadataInputRaw(role.signerTitle);
  const [editOpen, setEditOpen] = useState(false);

  if (known && !editOpen) {
    return (
      <div className="vs01-prepare-signer-metadata-compact" role="group" aria-label="Signer details">
        <p className="vs01-prepare-signer-metadata-compact-line">
          Representative: <strong>{signerName}</strong>
          {signerTitle ? (
            <>
              {" "}
              · <span>{signerTitle}</span>
            </>
          ) : null}
        </p>
        <button
          type="button"
          className="vs01-btn vs01-btn--secondary vs01-btn--auto vs01-prepare-signer-metadata-edit-btn"
          disabled={busy}
          onClick={() => setEditOpen(true)}
        >
          Edit signer details
        </button>
      </div>
    );
  }

  return (
    <SignerMetadataEditor
      party={party}
      signerName={signerName}
      signerTitle={signerTitle}
      busy={busy}
      panelCopy={panelCopy}
      onPatch={onPatch}
      onDone={known ? () => setEditOpen(false) : undefined}
    />
  );
}

function SignerMetadataEditor({
  party,
  signerName,
  signerTitle,
  busy,
  panelCopy,
  onPatch,
  onDone,
}: {
  party: string;
  signerName: string;
  signerTitle: string;
  busy: boolean;
  panelCopy: ReturnType<typeof resolvePrepareSignerMetadataPanelTitle>;
  onPatch: (patch: { signerName?: string; signerTitle?: string }) => void;
  onDone?: () => void;
}) {
  return (
    <div className="vs01-prepare-signer-metadata-panel" role="group" aria-label="Signer details">
      <p
        className={`vs01-prepare-signer-metadata-title${
          panelCopy.severity === "required" ? " vs01-prepare-signer-metadata-title--required" : ""
        }`}
      >
        {panelCopy.title}
      </p>
      {party ? (
        <p className="vs01-prepare-signer-metadata-party">
          Party: <strong>{party}</strong>
        </p>
      ) : null}
      <label className="vs01-prepare-signer-metadata-field">
        <span className="vs01-prepare-signer-metadata-label">Representative name (optional)</span>
        <input
          type="text"
          className="vs01-prepare-signer-metadata-input"
          value={signerName}
          disabled={busy}
          placeholder="Human signer name"
          autoComplete="name"
          onChange={(ev) => {
            onPatch({ signerName: ev.target.value });
          }}
          onBlur={(ev) => {
            logSignerMetadataInputBlur({
              surface: "vs01_prepare_rail",
              field: "signerName",
              raw: ev.target.value,
            });
            const before = ev.target.value;
            const after = normalizeSignerMetadataForSave(before) ?? "";
            if (after !== before) {
              logSignerMetadataNormalizedForSave({
                surface: "vs01_prepare_rail",
                field: "signerName",
                beforeLen: before.length,
                afterLen: after.length,
              });
              onPatch({ signerName: after });
            }
          }}
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => ev.stopPropagation()}
        />
      </label>
      <label className="vs01-prepare-signer-metadata-field">
        <span className="vs01-prepare-signer-metadata-label">Title (optional)</span>
        <input
          type="text"
          className="vs01-prepare-signer-metadata-input"
          value={signerTitle}
          disabled={busy}
          placeholder="Title or role"
          autoComplete="organization-title"
          onChange={(ev) => {
            onPatch({ signerTitle: ev.target.value });
          }}
          onBlur={(ev) => {
            logSignerMetadataInputBlur({
              surface: "vs01_prepare_rail",
              field: "signerTitle",
              raw: ev.target.value,
            });
            const before = ev.target.value;
            const after = normalizeSignerMetadataForSave(before) ?? "";
            if (after !== before) {
              logSignerMetadataNormalizedForSave({
                surface: "vs01_prepare_rail",
                field: "signerTitle",
                beforeLen: before.length,
                afterLen: after.length,
              });
              onPatch({ signerTitle: after });
            }
          }}
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => ev.stopPropagation()}
        />
      </label>
      {panelCopy.hint ? (
        <p className="vs01-prepare-signer-metadata-hint">{panelCopy.hint}</p>
      ) : null}
      {onDone ? (
        <button
          type="button"
          className="vs01-btn vs01-btn--secondary vs01-btn--auto mt-2"
          disabled={busy}
          onClick={onDone}
        >
          Done editing
        </button>
      ) : null}
    </div>
  );
}
