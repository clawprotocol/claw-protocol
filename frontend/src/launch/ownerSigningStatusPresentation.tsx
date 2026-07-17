import type { OwnerSigningStatusHydratedState } from "./ownerSigningStatusHydration";
import { authorityStatusCopy } from "./ownerSigningStatusPresentationPolicy";

export function OwnerAuthorityBanner({ state }: { state: OwnerSigningStatusHydratedState }) {
  return (
    <>
      <p
        className={state.status === "conflict" ? "text-sm text-amber-300" : "text-sm text-slate-300"}
        role={state.status === "conflict" ? "alert" : "status"}
        data-testid="owner-signing-authority-state"
      >
        {authorityStatusCopy(state)}
      </p>
      {state.accepted ? (
        <p className="mt-2 text-xs text-slate-400">
          Accepted version: {state.accepted.version_id}
        </p>
      ) : null}
    </>
  );
}

export function BackendSignerPresentation({
  state,
}: {
  state: OwnerSigningStatusHydratedState;
}) {
  if (!state.frozen?.parties.length) return null;
  const signersByParty = new Map<string, typeof state.frozen.signers>();
  for (const signer of state.frozen.signers) {
    const rows = signersByParty.get(signer.agreementPartyId) ?? [];
    rows.push(signer);
    signersByParty.set(signer.agreementPartyId, rows);
  }
  return (
    <ol className="mt-5 space-y-3" data-testid="owner-signing-authority-parties">
      {[...state.frozen.parties]
        .sort((left, right) => left.canonicalOrder - right.canonicalOrder)
        .map((party) => (
          <li
            key={party.agreementPartyId}
            className="rounded-lg border border-slate-700 bg-slate-900/40 p-3"
          >
            <p className="text-sm font-medium text-slate-100">{party.legalEntityName}</p>
            {(signersByParty.get(party.agreementPartyId) ?? []).map((signer) => (
              <p key={signer.signerRecordId} className="mt-1 text-xs text-slate-400">
                {signer.signerName}
                {signer.signerTitle ? ` · ${signer.signerTitle}` : ""} · {signer.signerEmail}
              </p>
            ))}
          </li>
        ))}
    </ol>
  );
}
