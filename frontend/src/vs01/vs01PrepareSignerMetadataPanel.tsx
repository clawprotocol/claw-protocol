import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import { isKnownPrepareSignerName, resolvePreparePartyEntityLabel } from "./vs01PrepareSignerDisplay";

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
  const signerName = (role.signerName ?? "").trim();
  const signerTitle = (role.signerTitle ?? "").trim();

  return (
    <div className="vs01-prepare-signer-metadata-panel" role="group" aria-label="Signer details">
      <p className="vs01-prepare-signer-metadata-title">
        {known ? "Signer details" : "Signer name not set"}
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
          onChange={(ev) => onPatch({ signerName: ev.target.value })}
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
          onChange={(ev) => onPatch({ signerTitle: ev.target.value })}
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => ev.stopPropagation()}
        />
      </label>
      {!known ? (
        <p className="vs01-prepare-signer-metadata-hint">
          Printed name fields show &ldquo;Signer name&rdquo; with party context until you enter a representative name
          or the signer provides it from their link.
        </p>
      ) : null}
    </div>
  );
}
