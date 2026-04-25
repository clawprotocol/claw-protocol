import { useEffect, useState } from "react";
import {
  fetchComplianceDisclosureMap,
  postComplianceAcknowledgement,
  type DisclosureRecord,
} from "./complianceApi";

type Props = {
  disclosureKey: string;
  orgId?: string;
  userRef?: string;
  subjectType?: string;
  subjectId?: string;
  label: string;
  className?: string;
  onLogged?: (acknowledgementId: string) => void;
};

/**
 * Checkbox + optional POST to /v1/compliance/acknowledgements when disclosure hash matches server.
 */
export function ConsentAcknowledgement(props: Props) {
  const {
    disclosureKey,
    orgId,
    userRef,
    subjectType,
    subjectId,
    label,
    className = "",
    onLogged,
  } = props;
  const [checked, setChecked] = useState(false);
  const [record, setRecord] = useState<DisclosureRecord | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [postErr, setPostErr] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      setLoadErr(null);
      const map = await fetchComplianceDisclosureMap();
      if (cancel) return;
      const rec = map?.[disclosureKey] ?? null;
      if (!rec) {
        setLoadErr("Disclosures unavailable — you can still continue; acceptance was not logged.");
        setRecord(null);
        return;
      }
      setRecord(rec);
    })();
    return () => {
      cancel = true;
    };
  }, [disclosureKey]);

  async function onChange(next: boolean) {
    setChecked(next);
    setPostErr(null);
    if (!next || !record || posted) return;
    const res = await postComplianceAcknowledgement({
      disclosure_key: disclosureKey,
      disclosure_version: record.version,
      disclosure_hash: record.content_sha256,
      org_id: orgId,
      user_ref: userRef,
      subject_type: subjectType,
      subject_id: subjectId,
    });
    if (res.ok) {
      setPosted(true);
      onLogged?.(res.acknowledgement_id);
    } else {
      setPostErr(res.error);
    }
  }

  return (
    <div className={`text-left text-[11px] text-slate-400 sm:text-xs ${className}`}>
      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5 rounded border-slate-600 bg-slate-950"
          checked={checked}
          onChange={(e) => void onChange(e.target.checked)}
        />
        <span>{label}</span>
      </label>
      {loadErr ? <p className="mt-2 text-amber-200/80">{loadErr}</p> : null}
      {postErr ? <p className="mt-2 text-rose-300/90">{postErr}</p> : null}
      {posted ? <p className="mt-2 text-emerald-400/90">Acknowledgement logged.</p> : null}
    </div>
  );
}
