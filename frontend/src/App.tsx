import React, { Component, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { exportFilledPdf } from "./esignExportPdf";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

class EsignPdfErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { error: err };
  }
  componentDidCatch() {}
  render() {
    if (this.state.error) {
      return (
        <div className="rounded border border-red-800 bg-red-950/50 p-3 text-sm text-red-200">
          <div className="font-semibold">PDF render error</div>
          <div className="mt-1 text-xs text-red-300">{String(this.state.error.message)}</div>
          {this.state.error.stack && (
            <pre className="mt-2 max-h-24 overflow-auto text-xs text-red-400">
              {this.state.error.stack}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";
const SHOW_DEMOS = false;
const DEBUG_ESIGN =
  typeof window !== "undefined" &&
  window.localStorage?.getItem("clawDebug") === "1";

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

type VerifyCheck = { name: string; ok: boolean; detail?: string };
type VerifyReport = {
  ok: boolean;
  checks: VerifyCheck[];
  summary?: Record<string, any>;
  recomputed?: Record<string, any>;
};

const App: React.FC = () => {
  // UX walkthrough:
  // - Prepare mode: sender uploads, assigns recipients/assignee, places fields, and sends.
  // - Sign mode: current actor only fills assigned required fields; placement/editing is locked.
  // - Sender may send before signing, or sign first then send; Activity tracks both flows.
  const [phase, setPhase] = useState<
    "landing" | "chooser" | "timeline" | "esign" | "liability" | "agreement" | "verify"
  >("landing");
  const [apiVersion, setApiVersion] = useState<{
    protocol_version?: string;
    api_version?: string;
  } | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoLog, setDemoLog] = useState<string[]>([]);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [demoSummary, setDemoSummary] = useState<Record<string, any> | null>(
    null
  );
  const [demoZipUrl, setDemoZipUrl] = useState<string | null>(null);
  const [demoVerify, setDemoVerify] = useState<VerifyReport | null>(null);
  const [lastGoodZipBlob, setLastGoodZipBlob] = useState<Blob | null>(null);
  const [lastTamperedZipBlob, setLastTamperedZipBlob] = useState<Blob | null>(
    null
  );
  const [tamperReport, setTamperReport] = useState<VerifyReport | null>(null);
  const [tamperError, setTamperError] = useState<string | null>(null);
  const [tamperLabel, setTamperLabel] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState<
    "Full Bundle" | "Timeline only" | "Agreement only" | "Analyst only"
  >("Full Bundle");
  const [demoReproduce, setDemoReproduce] = useState(false);
  const [demoCreatedAt, setDemoCreatedAt] = useState("2026-01-01T00:00:00Z");
  const [demoEpochId, setDemoEpochId] = useState("epoch-demo-fixed");
  const [demoTimelineId, setDemoTimelineId] = useState("tl_demo_fixed");
  const [demoAnchorNetwork, setDemoAnchorNetwork] =
    useState("bitcoin-testnet");
  const [timelineId, setTimelineId] = useState("tl_demo_001");
  const [timelineTitle, setTimelineTitle] = useState("Workflow Demo");
  const [createdAt, setCreatedAt] = useState("2026-01-01T00:00:00Z");
  const [eventTime, setEventTime] = useState("2026-01-01T00:00:00Z");
  const [noticeText, setNoticeText] = useState("Notice: verify run");
  const [frozenAt, setFrozenAt] = useState("2026-01-01T00:00:00Z");
  const [anchorNetwork, setAnchorNetwork] = useState("bitcoin-testnet");
  const [epochId, setEpochId] = useState("epoch-demo");
  const [issuedAt, setIssuedAt] = useState("2026-01-01T00:00:00Z");

  const [timeline, setTimeline] = useState<any | null>(null);
  const [receipt, setReceipt] = useState<any | null>(null);
  const [timelineStatus, setTimelineStatus] = useState<string | null>(null);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [timelineFrozen, setTimelineFrozen] = useState(false);

  const [esign, setEsign] = useState<any | null>(null);
  const [liability, setLiability] = useState<any | null>(null);
  const [liabilityPacketSha, setLiabilityPacketSha] = useState<string | null>(null);
  const [liabilityStatus, setLiabilityStatus] = useState<string | null>(null);
  const [liabilityError, setLiabilityError] = useState<string | null>(null);
  const [esignPacket, setEsignPacket] = useState<any | null>(null);
  const [esignStep, setEsignStep] = useState<
    "upload" | "signers" | "place" | "invite" | "sign" | "done"
  >("upload");
  const [esignPreviewUrl, setEsignPreviewUrl] = useState<string | null>(null);
  const [esignMode, setEsignMode] = useState<"prepare" | "sign">("prepare");
  const [esignActiveRecipientEmail, setEsignActiveRecipientEmail] = useState("");
  const [esignSigningAsEmail, setEsignSigningAsEmail] = useState("");
  const [esignFieldTool, setEsignFieldTool] = useState<
    "signature" | "initials" | "date" | "text" | null
  >(null);
  const [esignFields, setEsignFields] = useState<
    {
      id: string;
      type: "signature" | "initials" | "date" | "text";
      signerId?: string;
      pageIndex: number;
      recipientEmail: string;
      xPct: number;
      yPct: number;
      wPct: number;
      hPct: number;
      value?: string;
      placeholder?: string;
      required?: boolean;
      repeatGroupId?: string;
      isRepeatClone?: boolean;
    }[]
  >([]);
  const [esignSelectedFieldId, setEsignSelectedFieldId] = useState<string | null>(
    null
  );
  const [esignPlacementHint, setEsignPlacementHint] = useState<string | null>(null);
  const [esignPageCount, setEsignPageCount] = useState(0);
  const [esignPageDimensions, setEsignPageDimensions] = useState<
    Record<number, { width: number; height: number }>
  >({});
  const [esignPdfError, setEsignPdfError] = useState<string | null>(null);
  const esignPreviewRef = useRef<HTMLDivElement | null>(null);
  // Stable width container (observed) vs scaled render wrapper (not observed).
  const outerStableRef = useRef<HTMLDivElement | null>(null);
  const pdfRenderRef = useRef<HTMLDivElement | null>(null);
  const lastScrolledFieldIdRef = useRef<string | null>(null);
  const scrollRafRef = useRef<number>(0);
  const versionFetchedRef = useRef(false);
  const [fitScale, setFitScale] = useState(1);
  const [userZoom, setUserZoom] = useState(1);
  const [esignDrag, setEsignDrag] = useState<{
    id: string;
    mode: "move" | "resize-se" | "resize-sw" | "resize-ne" | "resize-nw";
    startX: number;
    startY: number;
    startXPct: number;
    startYPct: number;
    startWPct: number;
    startHPct: number;
    pageIndex: number;
  } | null>(null);
  const [esignEditingFieldId, setEsignEditingFieldId] = useState<string | null>(null);
  const [esignDraftById, setEsignDraftById] = useState<Record<string, string>>({});
  const [esignHighlightedFieldId, setEsignHighlightedFieldId] = useState<string | null>(null);
  const [esignSignatureModal, setEsignSignatureModal] = useState<{ fieldId?: string; type: "signature" | "initials" } | null>(null);
  const [esignSavedToast, setEsignSavedToast] = useState(false);
  const [esignDebugEvents, setEsignDebugEvents] = useState<
    { type: string; targetTag?: string; targetClass?: string; overlayRan?: boolean; ts: number }[]
  >([]);
  const esignSignatureInputsRef = useRef<HTMLDivElement | null>(null);
  const [esignInviteLinks, setEsignInviteLinks] = useState<Record<string, string>>(
    {}
  );
  const [esignCompletedByEmail, setEsignCompletedByEmail] = useState<string[]>([]);
  const [esignSignatureType, setEsignSignatureType] = useState<
    "typed" | "drawn" | "image"
  >("typed");
  const [esignSignatureValue, setEsignSignatureValue] = useState<string>("");
  const [esignInitialsValue, setEsignInitialsValue] = useState<string>("");
  const [esignDefaultsByRecipient, setEsignDefaultsByRecipient] = useState<
    Record<string, { signatureType?: "typed" | "drawn" | "image"; signatureValue?: string; initialsValue?: string }>
  >({});
  const [esignSaveSignature, setEsignSaveSignature] = useState(true);
  const [esignSaveInitials, setEsignSaveInitials] = useState(true);
  const [currentTargetFieldId, setCurrentTargetFieldId] = useState<string | null>(null);
  const [showSignCompleteModal, setShowSignCompleteModal] = useState(false);
  const [showSignRequiredPanel, setShowSignRequiredPanel] = useState(false);
  const [esignSideTab, setEsignSideTab] = useState<"recipients" | "fields">("recipients");
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendSubject, setSendSubject] = useState("Please sign this document");
  const [sendMessage, setSendMessage] = useState("Please review and sign at your earliest convenience.");
  const [recipientStatusByEmail, setRecipientStatusByEmail] = useState<
    Record<string, "Not Sent" | "Sent" | "Viewed" | "Signed">
  >({});
  const [mobileSidePanelOpen, setMobileSidePanelOpen] = useState(false);
  const [esignActivity, setEsignActivity] = useState<
    { ts: number; message: string }[]
  >([]);
  const [esignSentLocked, setEsignSentLocked] = useState(false);
  const [allowNoRecipientFieldsRequired, setAllowNoRecipientFieldsRequired] = useState(false);
  const [showIdentityModal, setShowIdentityModal] = useState(false);
  const [autoPlaceInitialsEveryPage, setAutoPlaceInitialsEveryPage] = useState(false);
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  const [esignSigners, setEsignSigners] = useState<
    { id: string; name: string; email: string; role: string; status: "Not Sent" | "Sent" | "Viewed" | "Signed"; signer_id?: string; typed_name?: string }[]
  >([{ id: `signer_${Date.now()}`, name: "", email: "", role: "host", status: "Not Sent" }]);
  const [activeSignerId, setActiveSignerId] = useState<string>("");
  const [esignDocFile, setEsignDocFile] = useState<File | null>(null);
  const [esignTitle, setEsignTitle] = useState("Demo Document");
  const [, setEsignMime] = useState("text/plain");
  const [esignStatus, setEsignStatus] = useState<string | null>(null);
  const [esignError, setEsignError] = useState<string | null>(null);
  const [liabilityFactsText, setLiabilityFactsText] = useState(
    "I was the sole operator of the system during the relevant period."
  );
  const [liabilityLegalContextText, setLiabilityLegalContextText] = useState(
    "Educational reference only."
  );
  const [liabilityLegalCitations, setLiabilityLegalCitations] = useState("");
  const [liabilityPrivateNotes, setLiabilityPrivateNotes] = useState("");
  const [includePublicLegalContext, setIncludePublicLegalContext] =
    useState(false);
  const [includePrivateNotes, setIncludePrivateNotes] = useState(false);
  const [liabilityAuthorName, setLiabilityAuthorName] = useState("Author");
  const [liabilityAuthorRole, setLiabilityAuthorRole] = useState("Declarant");
  const [liabilityUpdatedAt, setLiabilityUpdatedAt] = useState(
    "2026-01-01T00:00:00Z"
  );

  const [agreementTitle, setAgreementTitle] = useState("Agreement Demo");
  const [agreementJurisdiction, setAgreementJurisdiction] = useState("CA");
  const [agreementParties, setAgreementParties] = useState("Alice; Bob");
  const [agreementEffectiveDate, setAgreementEffectiveDate] =
    useState("2026-01-01");
  const [agreementContent, setAgreementContent] =
    useState("Demo agreement text.");
  const [agreementId, setAgreementId] = useState("ag_demo_001");
  const [agreement, setAgreement] = useState<any | null>(null);
  const [agreementPacket, setAgreementPacket] = useState<any | null>(null);
  const [agreementPacketStatus, setAgreementPacketStatus] = useState<string | null>(null);
  const [agreementPacketError, setAgreementPacketError] = useState<string | null>(null);
  const [agreementDiffOpen, setAgreementDiffOpen] = useState<Record<string, boolean>>({});
  const [agreementPartyRows, setAgreementPartyRows] = useState<
    { party_id: string; name: string; role: string; contact?: string }[]
  >([
    { party_id: "party_alice", name: "Alice", role: "party" },
    { party_id: "party_bob", name: "Bob", role: "party" },
  ]);
  const [agreementAuthorPartyId, setAgreementAuthorPartyId] =
    useState("party_alice");
  const [agreementBodyText, setAgreementBodyText] = useState(
    "Agreement body text."
  );
  const [agreementContentType, setAgreementContentType] =
    useState("text/markdown");
  const [agreementVersionNotes, setAgreementVersionNotes] = useState("");
  const [agreementIncludeDiffs, setAgreementIncludeDiffs] = useState(true);
  const [agreementIncludeNotes, setAgreementIncludeNotes] = useState(false);
  const [agreementEscrowRef, setAgreementEscrowRef] = useState("");
  const [agreementAnalysisText, setAgreementAnalysisText] = useState("");
  const [agreementAnalysisInclude, setAgreementAnalysisInclude] = useState(false);
  const [agreementAnalysisOptInAll, setAgreementAnalysisOptInAll] =
    useState(false);
  const [agreementRedlines, setAgreementRedlines] = useState<any[]>([]);
  const [agreementExport, setAgreementExport] = useState<any | null>(null);
  const [agreementStatus, setAgreementStatus] = useState<string | null>(null);
  const [agreementError, setAgreementError] = useState<string | null>(null);
  const [attachAgreement, setAttachAgreement] = useState(false);
  const [agreementVersions, setAgreementVersions] = useState<any[]>([]);
  const [fromVersion, setFromVersion] = useState("");
  const [toVersion, setToVersion] = useState("");
  const [diffText, setDiffText] = useState("");
  const [diffSha256, setDiffSha256] = useState("");
  const [includeDiff, setIncludeDiff] = useState(false);
  const [includeAgreementVersion, setIncludeAgreementVersion] = useState(false);
  const [agreementVersionToExport, setAgreementVersionToExport] = useState("");
  const [redlineText, setRedlineText] = useState("Replace clause 2");
  const [redlineRationale, setRedlineRationale] = useState("Clarify scope");
  const [redlineAuthor, setRedlineAuthor] = useState("Alice");
  const [redlineCreatedAt, setRedlineCreatedAt] =
    useState("2026-01-02T00:00:00Z");

  const [claims, setClaims] = useState('["Example claim"]');
  const [references, setReferences] = useState("[]");
  const [timelines, setTimelines] = useState("[]");
  const [dispute, setDispute] = useState<any | null>(null);

  const [exportDir, setExportDir] = useState("artifacts/workflow_bundle");
  const [exportResult, setExportResult] = useState<string>("");

  const [verifyFiles, setVerifyFiles] = useState<FileList | null>(null);
  const [verifyReport, setVerifyReport] = useState<VerifyReport | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);


  async function postJson(path: string, body: unknown) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return res.json();
  }

  useEffect(() => {
    if (versionFetchedRef.current) return;
    versionFetchedRef.current = true;
    let cancelled = false;
    const fetchVersion = async () => {
      const res = await fetch(`${API_BASE}/v1/version`);
      if (!res.ok) throw new Error("version_unavailable");
      return res.json();
    };
    const run = async () => {
      try {
        const data = await fetchVersion();
        if (!cancelled) {
          setApiVersion(data);
          setBackendOnline(true);
        }
      } catch {
        try {
          await new Promise((resolve) => window.setTimeout(resolve, 900));
          const data = await fetchVersion();
          if (!cancelled) {
            setApiVersion(data);
            setBackendOnline(true);
          }
        } catch {
          if (!cancelled) {
            setApiVersion(null);
            setBackendOnline(false);
          }
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!esignDocFile) {
      setEsignPreviewUrl(null);
      setEsignPageCount(0);
      setEsignPageDimensions({});
      setEsignPdfError(null);
      return;
    }
    const url = URL.createObjectURL(esignDocFile);
    setEsignPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [esignDocFile]);

  useEffect(() => {
    if (esignSigners.length === 0) return;
    setActiveSignerId((prev) =>
      esignSigners.some((s) => s.id === prev) ? prev : esignSigners[0].id
    );
    const emails = esignSigners.map((s) => s.email || "").filter(Boolean);
    const firstEmail = emails[0] || "";
    setEsignSigningAsEmail((prev) => (emails.includes(prev) ? prev : firstEmail));
  }, [esignSigners]);

  useEffect(() => {
    const signer = esignSigners.find((s) => s.id === activeSignerId);
    const email = (signer?.email || "").trim();
    setEsignActiveRecipientEmail(email);
  }, [activeSignerId, esignSigners]);

  useEffect(() => {
    setRecipientStatusByEmail((prev) => {
      const next: Record<string, "Not Sent" | "Sent" | "Viewed" | "Signed"> = {};
      esignSigners.forEach((s) => {
        const email = s.email || "";
        if (!email) return;
        next[email] = prev[email] || "Not Sent";
      });
      return next;
    });
  }, [esignSigners]);

  useEffect(() => {
    if (esignCompletedByEmail.length === 0) return;
    setRecipientStatusByEmail((prev) => {
      let changed = false;
      const next = { ...prev };
      esignCompletedByEmail.forEach((email) => {
        if (email && next[email] !== "Signed") {
          next[email] = "Signed";
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [esignCompletedByEmail]);

  useEffect(() => {
    if (!esignPacket?.packet_id) return;
    try {
      const stored = localStorage.getItem(
        `claw.esign.fields.${esignPacket.packet_id}`
      );
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const migrated = parsed.map((field: any) => {
            if (field.xPct != null) {
              return {
                id: field.id,
                type: field.type,
                signerId: field.signerId,
                pageIndex: Number.isFinite(field.pageIndex) ? field.pageIndex : 0,
                recipientEmail: field.recipientEmail || field.signerEmail || "",
                xPct: field.xPct,
                yPct: field.yPct,
                wPct: field.wPct,
                hPct: field.hPct,
                value: field.value,
                placeholder: field.placeholder,
                required: field.required,
                repeatGroupId: field.repeatGroupId,
                isRepeatClone: field.isRepeatClone,
              };
            }
            const pw = 612;
            const ph = 792;
            return {
              id: field.id,
              type: field.type,
              signerId: field.signerId,
              pageIndex: Number.isFinite(field.pageIndex) ? field.pageIndex : 0,
              recipientEmail: field.recipientEmail || field.signerEmail || "",
              xPct: (field.x ?? 0) / pw,
              yPct: (field.y ?? 0) / ph,
              wPct: Math.min(1, (field.w ?? 160) / pw),
              hPct: Math.min(1, (field.h ?? 48) / ph),
              value: field.value,
              placeholder: field.placeholder,
              required: field.required,
              repeatGroupId: field.repeatGroupId,
              isRepeatClone: field.isRepeatClone,
            };
          });
          if (DEBUG_ESIGN) console.log("REPLACE_BOXES", "localStorage_load", migrated.length);
          setEsignFields(migrated);
        }
      }
    } catch {
      // ignore
    }
  }, [esignPacket?.packet_id]);

  useEffect(() => {
    if (!esignPacket?.packet_id) return;
    try {
      localStorage.setItem(
        `claw.esign.fields.${esignPacket.packet_id}`,
        JSON.stringify(esignFields)
      );
    } catch {
      // ignore
    }
  }, [esignFields, esignPacket?.packet_id]);

  useEffect(() => {
    try {
      const byRecipient = localStorage.getItem("claw.esign.defaults_by_recipient.v1");
      if (byRecipient) {
        const parsed = JSON.parse(byRecipient);
        if (parsed && typeof parsed === "object") {
          setEsignDefaultsByRecipient(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "claw.esign.defaults_by_recipient.v1",
        JSON.stringify(esignDefaultsByRecipient)
      );
    } catch {
      // ignore
    }
  }, [esignDefaultsByRecipient]);

  useEffect(() => {
    const key = (esignSigningAsEmail || "").toLowerCase();
    if (!key) return;
    const d = esignDefaultsByRecipient[key];
    const signer = esignSigners.find((s) => (s.email || "").toLowerCase() === key);
    const defaultSig = signer?.name?.trim() || signer?.email || "";
    const defaultIni = deriveInitials(defaultSig);
    if (!d) {
      if (defaultSig) setEsignSignatureValue(defaultSig);
      if (defaultIni) setEsignInitialsValue(defaultIni);
      return;
    }
    if (d.signatureType) setEsignSignatureType(d.signatureType);
    if (typeof d.signatureValue === "string") setEsignSignatureValue(d.signatureValue || defaultSig);
    else if (defaultSig) setEsignSignatureValue((prev) => prev || defaultSig);
    if (typeof d.initialsValue === "string") setEsignInitialsValue(d.initialsValue || defaultIni);
    else if (defaultIni) setEsignInitialsValue((prev) => prev || defaultIni);
  }, [esignSigningAsEmail, esignDefaultsByRecipient, esignSigners]);

  useEffect(() => {
    // Auto-apply per-recipient defaults when entering Sign/Fill.
    if (phase !== "esign" || esignMode !== "sign") return;
    setEsignFields((prev) => {
      let changed = false;
      const next = prev.map((f) => {
        if (f.value && String(f.value).trim()) return f;
        if (f.type !== "signature" && f.type !== "initials") return f;
        const key = (f.recipientEmail || "").toLowerCase();
        const d = key ? esignDefaultsByRecipient[key] : undefined;
        const isCurrentSigner =
          key && key === (esignSigningAsEmail || "").toLowerCase();
        const v =
          f.type === "signature"
            ? (d?.signatureValue || (isCurrentSigner ? esignSignatureValue : ""))
            : (d?.initialsValue || (isCurrentSigner ? esignInitialsValue : ""));
        if (!v || !String(v).trim()) return f;
        changed = true;
        return { ...f, value: v };
      });
      return changed ? next : prev;
    });
  }, [phase, esignMode, esignDefaultsByRecipient, esignSigningAsEmail, esignSignatureValue, esignInitialsValue]);

  useEffect(() => {
    if (!esignSaveSignature) return;
    if (!esignSignatureValue) return;
    const key = (esignSigningAsEmail || "").toLowerCase();
    if (key) {
      setEsignDefaultsByRecipient((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          signatureType: esignSignatureType,
          signatureValue: esignSignatureValue,
        },
      }));
    }
  }, [esignSignatureType, esignSignatureValue, esignSaveSignature, esignSigningAsEmail]);

  useEffect(() => {
    if (!esignSaveInitials) return;
    if (!esignInitialsValue) return;
    const key = (esignSigningAsEmail || "").toLowerCase();
    if (key) {
      setEsignDefaultsByRecipient((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          initialsValue: esignInitialsValue,
        },
      }));
    }
  }, [esignInitialsValue, esignSaveInitials, esignSigningAsEmail]);

  function copyToClipboard(text: string) {
    if (!navigator?.clipboard) return;
    navigator.clipboard.writeText(text).catch(() => undefined);
  }

  const deriveInitials = (nameOrEmail: string) => {
    const base = (nameOrEmail || "").trim();
    if (!base) return "";
    const cleaned = base.includes("@") ? base.split("@")[0] : base;
    const parts = cleaned
      .replace(/[^a-zA-Z0-9 ]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) return "";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
  };

  const addEsignActivity = (message: string) => {
    setEsignActivity((prev) => [{ ts: Date.now(), message }, ...prev].slice(0, 100));
  };

  function logStep(message: string) {
    setDemoLog((prev) => [...prev, message]);
  }

  function b64ToBlob(b64: string): Blob {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return new Blob([bytes], { type: "application/zip" });
  }

  function getDemoInputs() {
    if (demoReproduce) {
      return {
        created_at: demoCreatedAt,
        epoch_id: demoEpochId,
        timeline_id: demoTimelineId,
        anchor_network: demoAnchorNetwork,
      };
    }
    const now = new Date().toISOString();
    return {
      created_at: now,
      epoch_id: `epoch-demo-${now.replace(/[-:.TZ]/g, "").slice(-6)}`,
      timeline_id: `tl_demo_${now.replace(/[-:.TZ]/g, "").slice(-6)}`,
      anchor_network: anchorNetwork,
    };
  }

  function resetDemoState() {
    setDemoLog([]);
    setDemoError(null);
    setDemoSummary(null);
    setDemoZipUrl(null);
    setDemoVerify(null);
    setTimeline(null);
    setReceipt(null);
    setEsign(null);
    setLiability(null);
    setLiabilityPacketSha(null);
    setAgreement(null);
    setAgreementPacket(null);
    setAgreementPacketStatus(null);
    setAgreementPacketError(null);
    setAgreementRedlines([]);
    setAgreementExport(null);
    setDispute(null);
    setExportResult("");
    setTimelineStatus(null);
    setTimelineError(null);
    setEsignStatus(null);
    setEsignError(null);
    setLiabilityStatus(null);
    setLiabilityError(null);
    setAgreementStatus(null);
    setAgreementError(null);
  }

  const runDemoFull = async () => {
    const inputs = getDemoInputs();
    const demoRunBody = {
      created_at: inputs.created_at,
      anchor_network: inputs.anchor_network,
      epoch_id: inputs.epoch_id,
      timeline_id: inputs.timeline_id,
    };
    logStep("Run demo preset...");
    const res = await fetch(`${API_BASE}/v1/workflow/demo/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(demoRunBody),
    });
    if (res.status === 404) {
      throw new Error("demo_run_not_found");
    }
    if (!res.ok) {
      throw new Error(await res.text());
    }
    const payload = await res.json();
    let zipBlob: Blob | null = null;
    try {
        const zipRes = await fetch(`${API_BASE}/v1/workflow/demo/run?format=zip`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(demoRunBody),
        });
        if (zipRes.ok) {
          zipBlob = await zipRes.blob();
        }
    } catch {
        zipBlob = null;
    }
    if (!zipBlob) {
      zipBlob = b64ToBlob(payload.zip_b64 || "");
    }
    const zipUrl = URL.createObjectURL(zipBlob);
    setDemoZipUrl(zipUrl);
    setLastGoodZipBlob(zipBlob);
    setLastTamperedZipBlob(null);
    setDemoVerify(payload.verify_report || null);
    setDemoSummary({
      timeline_id: payload.summary?.timeline_id,
      epoch_id: payload.summary?.epoch_id,
      frozen_manifest_sha256: payload.summary?.frozen_manifest_sha256,
      receipt_commitment: payload.summary?.receipt_commitment,
      merkle_root_sha256: payload.summary?.merkle_root_sha256 || null,
      verify_ok: payload.summary?.verify_ok ?? payload.verify_report?.ok,
      checks: payload.verify_report?.checks || [],
      inputs,
    });
    logStep("Demo complete.");
  };

  const runDemoMulti = async (mode: string) => {
    try {
      const inputs = getDemoInputs();
      const now = inputs.created_at;
      const demoTimelineId = inputs.timeline_id;
      const demoEpochId = inputs.epoch_id;
      const t1 = now;
      const t2 = demoReproduce
        ? new Date(Date.parse(now) + 1000).toISOString()
        : new Date(Date.now() + 1000).toISOString();
      const t3 = demoReproduce
        ? new Date(Date.parse(now) + 2000).toISOString()
        : new Date(Date.now() + 2000).toISOString();

      const createTimelineBody = {
        timeline_id: demoTimelineId,
        title: "One-click Demo Timeline",
        network: "testnet",
        created_at: now,
        parties: [
          { role: "author", id: "demo-author", display_name: "Demo Author" },
        ],
      };
      logStep("Create timeline...");
      let demoTimeline = await postJson(
        "/v1/workflow/timeline/create",
        createTimelineBody
      );

      const appendBodies = [
        {
          timeline: demoTimeline,
          event_type: "notice",
          event_time: t1,
          notice: { text: "Demo event 1" },
          marker: null,
        },
        {
          timeline: demoTimeline,
          event_type: "notice",
          event_time: t2,
          notice: { text: "Demo event 2" },
          marker: null,
        },
        {
          timeline: demoTimeline,
          event_type: "notice",
          event_time: t3,
          notice: { text: "Demo event 3" },
          marker: null,
        },
      ];

      for (let i = 0; i < appendBodies.length; i++) {
        logStep(`Append event ${i + 1}...`);
        demoTimeline = await postJson("/v1/workflow/timeline/append", appendBodies[i]);
      }

      const freezeBody = { timeline: demoTimeline, frozen_at: now };
      logStep("Freeze timeline...");
      const frozen = await postJson("/v1/workflow/timeline/freeze", freezeBody);

      const receiptBody = {
        timeline_id: frozen.timeline_id,
        frozen_manifest_sha256: frozen.frozen_manifest_sha256,
        anchor_network: inputs.anchor_network,
        epoch_id: demoEpochId,
        issued_at: now,
        btc_txid: "pending",
      };
      logStep("Create receipt...");
      const demoReceipt = await postJson("/v1/workflow/receipt/create", receiptBody);

      let demoEsign: any = null;
      let demoLiability: any = null;
      let demoAgreement: any = null;
      let demoAnalysis: any = null;

      if (mode === "Full Bundle") {
        const esignBody = {
          signer_id: "signer_demo",
          signer_name: "Demo Signer",
          statement: "I attest to the facts stated in this record.",
          signed_at: now,
        };
        logStep("Create e-sign attestation...");
        demoEsign = await postJson(
          "/v1/workflow/attest/esign/create",
          esignBody
        );

        const liabilityBody = {
          subject_id: "subject_demo",
          role: "operator",
          capacity: "individual",
          control_asserted: true,
          access_asserted: true,
          valid_from: now,
          valid_to: "2027-01-01T00:00:00Z",
          exclusions: ["No authority to bind third parties"],
        };
        logStep("Create liability attestation...");
        demoLiability = await postJson(
          "/v1/workflow/attest/liability/create",
          liabilityBody
        );
      }

      if (mode === "Agreement only") {
        const agreementBody = {
          agreement_id: "ag_demo_001",
          title: "Demo Agreement",
          jurisdiction: "CA",
          parties: ["Alice", "Bob"],
          effective_date: "2026-01-01",
          body_markdown: "Demo agreement text.",
          created_at: now,
          updated_at: now,
        };
        logStep("Create agreement...");
        demoAgreement = await postJson(
          "/v1/workflow/agreement/draft",
          agreementBody
        );
      }

      if (mode === "Analyst only") {
        const analystBody = {
          evidence_bundle_id: "demo_bundle",
          evidence_refs: [
            { uri: "receipt://demo", content_hash_sha256: "0".repeat(64), label: "demo" },
          ],
          query: "Classify the provided evidence.",
          document_text: "Demo text for classification.",
          analysis_type: "general",
        };
        logStep("Run analyst classification...");
        demoAnalysis = await postJson("/v1/analyst/analyze", analystBody);
      }

      const exportBody = {
        out_dir: exportDir,
        created_at: now,
        timeline: frozen,
        receipt: demoReceipt,
        attestations: mode === "Full Bundle" ? [demoEsign, demoLiability] : [],
        agreement: mode === "Agreement only" ? demoAgreement : null,
        analysis: mode === "Analyst only" ? demoAnalysis : null,
        note: "one_click_demo",
      };
      logStep("Export bundle zip...");
      const exportRes = await fetch(`${API_BASE}/v1/workflow/bundle/export_zip`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(exportBody),
      });
      if (!exportRes.ok) {
        throw new Error(await exportRes.text());
      }
      const zipBlob = await exportRes.blob();
      const zipUrl = URL.createObjectURL(zipBlob);
      setDemoZipUrl(zipUrl);
      setLastGoodZipBlob(zipBlob);
      setLastTamperedZipBlob(null);

      logStep("Verify bundle zip...");
      const form = new FormData();
      form.append("bundle_zip", zipBlob, "bundle.zip");
      const verifyRes = await fetch(`${API_BASE}/v1/workflow/bundle/verify`, {
        method: "POST",
        body: form,
      });
      if (!verifyRes.ok) {
        throw new Error(await verifyRes.text());
      }
      const verifyReport = (await verifyRes.json()) as VerifyReport;
      setDemoVerify(verifyReport);

      setDemoSummary({
        timeline_id: frozen.timeline_id,
        epoch_id: demoEpochId,
        frozen_manifest_sha256: frozen.frozen_manifest_sha256,
        receipt_commitment: demoReceipt.commitment,
        merkle_root_sha256: demoReceipt.merkle_root_sha256 || null,
        verify_ok: verifyReport.ok,
        checks: verifyReport.checks,
        inputs,
      });
      logStep("Demo complete.");
    } catch (err: any) {
      setDemoError(err?.message || "Demo failed.");
      logStep("Demo failed.");
    }
  };

  const runDemo = async () => {
    try {
      setDemoRunning(true);
      setDemoLog([]);
      setDemoError(null);
      setDemoSummary(null);
      setDemoZipUrl(null);
      setDemoVerify(null);
      setLastGoodZipBlob(null);
      setLastTamperedZipBlob(null);
      setTamperReport(null);
      setTamperError(null);
      setTamperLabel(null);

      if (demoMode === "Full Bundle") {
        try {
          await runDemoFull();
          return;
        } catch (err: any) {
          if (String(err?.message || "").includes("demo_run_not_found")) {
            logStep("Demo preset not available; falling back to multi-call.");
          } else {
            throw err;
          }
        }
      }
      await runDemoMulti(demoMode);
    } catch (err: any) {
      setDemoError(err?.message || "Demo failed.");
      logStep("Demo failed.");
    } finally {
      setDemoRunning(false);
    }
  };

  const verifyZipBlob = async (blob: Blob, label: string) => {
    const form = new FormData();
    form.append("bundle_zip", blob, label);
    const res = await fetch(`${API_BASE}/v1/workflow/bundle/verify`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return (await res.json()) as VerifyReport;
  };

  const verifyUntampered = async () => {
    try {
      setTamperError(null);
      setTamperReport(null);
      setTamperLabel("Untampered");
      if (!lastGoodZipBlob) {
        setTamperError("Run Demo first to generate a bundle.");
        return;
      }
      const report = await verifyZipBlob(lastGoodZipBlob, "bundle.zip");
      setTamperReport(report);
    } catch (err: any) {
      setTamperError(err?.message || "Verification failed.");
    }
  };

  const verifyTampered = async () => {
    try {
      setTamperError(null);
      setTamperReport(null);
      setTamperLabel("Tampered");
      if (!lastTamperedZipBlob) {
        setTamperError("Run Simulate Tamper first to create a tampered bundle.");
        return;
      }
      const report = await verifyZipBlob(lastTamperedZipBlob, "bundle.tampered.zip");
      setTamperReport(report);
    } catch (err: any) {
      setTamperError(err?.message || "Verification failed.");
    }
  };

  const simulateTamper = async () => {
    try {
      setTamperError(null);
      setTamperReport(null);
      setTamperLabel("Tampered");
      if (!lastGoodZipBlob) {
        setTamperError("Run Demo first to generate a bundle.");
        return;
      }
      const buf = await lastGoodZipBlob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      if (bytes.length < 3) {
        setTamperError("Bundle too small to tamper.");
        return;
      }
      let offset = Math.floor(bytes.length / 2);
      if (bytes.length < 2048) {
        offset = Math.max(1, bytes.length - 2);
      }
      offset = Math.min(Math.max(1, offset), bytes.length - 2);
      bytes[offset] ^= 0x01;
      const tampered = new Blob([bytes], { type: "application/zip" });
      setLastTamperedZipBlob(tampered);
      const report = await verifyZipBlob(tampered, "bundle.tampered.zip");
      setTamperReport(report);
    } catch (err: any) {
      setTamperError(err?.message || "Tamper verification failed.");
    }
  };

  const copyDemoPayload = () => {
    const inputs = getDemoInputs();
    const body = {
      created_at: inputs.created_at,
      anchor_network: inputs.anchor_network,
      epoch_id: inputs.epoch_id,
      timeline_id: inputs.timeline_id,
    };
    copyToClipboard(JSON.stringify(body, null, 2));
  };

  const copyVerifyCurl = () => {
    copyToClipboard(
      `curl -s -X POST "${API_BASE}/v1/workflow/bundle/verify" -F "bundle_zip=@bundle.zip"`
    );
  };

  const createTimeline = async () => {
    try {
      setTimelineError(null);
      setTimelineStatus(null);
      if (!timelineId || !timelineTitle || !createdAt) {
        setTimelineError(
          "Please provide timeline_id, title, and created_at before creating."
        );
        return;
      }
      const tl = await postJson("/v1/workflow/timeline/create", {
        timeline_id: timelineId,
        title: timelineTitle,
        network: "testnet",
        created_at: createdAt,
        parties: [
          { role: "author", id: "demo-author", display_name: "Demo Author" },
        ],
      });
      setTimeline(tl);
      setTimelineStatus("Success: Timeline created. Next: Append event →");
    } catch (err: any) {
      setTimelineError(err?.message || "Timeline creation failed.");
    }
  };

  const appendEvent = async () => {
    try {
      setTimelineError(null);
      setTimelineStatus(null);
      setTimelineFrozen(false);
      if (!timeline) {
        setTimelineError("Create a timeline before appending events.");
        return;
      }
      if (!eventTime || !noticeText) {
        setTimelineError("Provide event_time and notice text before appending.");
        return;
      }
      const res = await fetch(`${API_BASE}/v1/workflow/timeline/append`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          timeline,
          event_type: "notice",
          event_time: eventTime,
          notice: { text: noticeText },
          marker: null,
        }),
      });
      if (!res.ok) {
        let payload: any = null;
        try {
          payload = await res.json();
        } catch {
          payload = null;
        }
        if (res.status === 409 && payload?.error_code === "TIMELINE_FROZEN") {
          setTimelineError(
            "This timeline is sealed. Create a new version to add events."
          );
          setTimelineFrozen(true);
          return;
        }
        throw new Error(payload?.message || (await res.text()));
      }
      const tl = await res.json();
      setTimeline(tl);
      setTimelineStatus("Success: Event appended. Next: Freeze timeline →");
    } catch (err: any) {
      setTimelineError(err?.message || "Append event failed.");
    }
  };

  const forkTimeline = async () => {
    try {
      setTimelineError(null);
      setTimelineStatus(null);
      if (!timeline) {
        setTimelineError("No timeline to fork.");
        return;
      }
      const res = await fetch(`${API_BASE}/v1/workflow/timeline/fork`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          timeline,
          created_at: createdAt,
          title: `${timelineTitle} (v2)`,
        }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const tl = await res.json();
      setTimeline(tl);
      setTimelineId(tl.timeline_id || timelineId);
      setTimelineTitle(tl.title || timelineTitle);
      setTimelineStatus("Created new draft version. You can append events.");
      setTimelineFrozen(false);
    } catch (err: any) {
      setTimelineError(err?.message || "Fork timeline failed.");
    }
  };

  const freezeTimeline = async () => {
    try {
      setTimelineError(null);
      setTimelineStatus(null);
      if (!timeline) {
        setTimelineError("Create a timeline before freezing.");
        return;
      }
      if (!frozenAt || !issuedAt || !epochId) {
        setTimelineError(
          "Provide frozen_at, issued_at, and epoch_id before freezing."
        );
        return;
      }
      const frozen = await postJson("/v1/workflow/timeline/freeze", {
        timeline,
        frozen_at: frozenAt,
      });
      setTimeline(frozen);
      const rcpt = await postJson("/v1/workflow/receipt/create", {
        timeline_id: frozen.timeline_id,
        frozen_manifest_sha256: frozen.frozen_manifest_sha256,
        anchor_network: anchorNetwork,
        epoch_id: epochId,
        issued_at: issuedAt,
        btc_txid: "pending",
      });
      setReceipt(rcpt);
      setTimelineStatus(
        "Success: Timeline frozen and receipt created. Next: Export bundle →"
      );
    } catch (err: any) {
      setTimelineError(err?.message || "Freeze timeline failed.");
    }
  };


  const createEsignPacket = async () => {
    try {
      setEsignError(null);
      setEsignStatus(null);
      if (!esignDocFile) {
        setEsignError("Select a document before creating a packet.");
        return;
      }
      const fileTitle = esignDocFile.name || "Document";
      const fileMime = esignDocFile.type || "application/pdf";
      const buf = await esignDocFile.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const res = await postJson("/v1/esign/create", {
        document_base64: b64,
        title: fileTitle,
        mime: fileMime,
        size: esignDocFile.size,
        signers: esignSigners.map((s) => ({
          name: s.name,
          email: s.email,
          role: s.role,
        })),
        created_at: createdAt,
      });
      setEsignPacket(res);
      setEsignTitle(fileTitle);
      setEsignMime(fileMime);
      setEsignFields([]);
      setEsignSelectedFieldId(null);
      setEsignInviteLinks({});
      setEsignCompletedByEmail([]);
      const idByEmail: Map<string, string> = new Map(
        (res.signers || []).map((s: any) => [
          (s.email || "").toLowerCase(),
          String(s.signer_id),
        ])
      );
      setEsignSigners(
        esignSigners.map((s) => ({
          ...s,
          signer_id: idByEmail.get((s.email || "").toLowerCase()) || s.signer_id,
          typed_name: s.typed_name || s.name,
        }))
      );
      setEsignStatus("Packet created. Next: Recipients sign.");
      setEsignStep("place");
    } catch (err: any) {
      setEsignError(err?.message || "Create packet failed.");
    }
  };

  const signEsignPacket = async (
    signer_id: string,
    signerEmail: string,
    typed_name?: string
  ) => {
    try {
      setEsignError(null);
      setEsignStatus(null);
      if (!esignPacket) {
        setEsignError("Create a packet before signing.");
        return;
      }
      if (!requiredFieldsComplete(signerEmail)) {
        setEsignError("Complete required fields before signing.");
        return;
      }
      const res = await postJson("/v1/esign/sign", {
        packet: esignPacket,
        signer_id,
        signed_at: createdAt,
        method: "typed",
        typed_name,
      });
      setEsignPacket(res);
      stampFieldsForSigner(signerEmail);
      setEsignCompletedByEmail((prev) =>
        prev.includes(signerEmail) ? prev : [...prev, signerEmail]
      );
      addEsignActivity(`Signer completed: ${signerEmail}`);
      setEsignStatus("Signature recorded. Next: Finalize.");
    } catch (err: any) {
      setEsignError(err?.message || "Sign failed.");
    }
  };

  const finalizeEsignPacket = async () => {
    try {
      setEsignError(null);
      setEsignStatus(null);
      if (!esignPacket) {
        setEsignError("Create a packet before finalizing.");
        return;
      }
      const att = await postJson("/v1/esign/finalize", {
        packet: esignPacket,
        finalized_at: createdAt,
      });
      setEsign(att);
      setEsignStatus("Finalized. Attestation ready for bundle export.");
      setEsignStep("done");
    } catch (err: any) {
      setEsignError(err?.message || "Finalize failed.");
    }
  };

  const allEsignSigned = () => {
    const signers = (esignPacket?.signers || [])
      .map((s: any) => s.signer_id)
      .filter(Boolean);
    if (signers.length === 0) return false;
    const signed = new Set(
      (esignPacket?.signatures || []).map((s: any) => s.signer_id)
    );
    return signers.every((s: string) => signed.has(s));
  };

  const basePageWidth = esignPageDimensions[0]?.width || 612;
  const effectiveScale = fitScale * userZoom;

  const isFieldComplete = (f: typeof esignFields[number]) =>
    Boolean(f.value && String(f.value).trim());

  const getRequiredFieldsForSigner = (email: string) =>
    esignFields.filter((f) => f.recipientEmail === email && f.required);

  const signerRequiredFieldsSorted = useMemo(
    () =>
      [...getRequiredFieldsForSigner(esignSigningAsEmail)].sort((a, b) => {
        if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
        if (a.yPct !== b.yPct) return a.yPct - b.yPct;
        return a.xPct - b.xPct;
      }),
    [esignFields, esignSigningAsEmail]
  );

  const signerIncompleteRequiredFieldsSorted = useMemo(
    () => signerRequiredFieldsSorted.filter((f) => !isFieldComplete(f)),
    [signerRequiredFieldsSorted]
  );

  const setDraftValue = (fieldId: string, value: string) => {
    setEsignDraftById((prev) => {
      if (prev[fieldId] === value) return prev;
      return { ...prev, [fieldId]: value };
    });
  };

  const setTargetField = (fieldId: string) => {
    if (!fieldId) return;
    setCurrentTargetFieldId((prev) => (prev === fieldId ? prev : fieldId));
    setEsignHighlightedFieldId(fieldId);
    window.setTimeout(
      () => setEsignHighlightedFieldId((v) => (v === fieldId ? null : v)),
      1200
    );
  };

  const jumpToFirstIncompleteRequiredField = () => {
    const next = signerIncompleteRequiredFieldsSorted[0] || signerRequiredFieldsSorted[0];
    if (!next) return;
    setTargetField(next.id);
  };

  const addEsignFieldAt = (pageIndex: number, xPct: number, yPct: number) => {
    if (!esignFieldTool) return;
    if (!activeSigner) {
      setEsignPlacementHint("Select a signer in the right panel to place fields.");
      return;
    }
    const recipientEmail = (activeSigner.email || "").trim();
    if (!recipientEmail || !isValidEmail(recipientEmail)) {
      setEsignPlacementHint("Active signer must have a valid email before placing fields.");
      return;
    }
    const defaults: Record<string, { wPct: number; hPct: number }> = {
      signature: { wPct: 0.17, hPct: 0.06 },
      initials: { wPct: 0.10, hPct: 0.05 },
      date: { wPct: 0.13, hPct: 0.05 },
      text: { wPct: 0.20, hPct: 0.05 },
    };
    const base = defaults[esignFieldTool];
    const dims = esignPageDimensions[pageIndex];
    const baselines = [0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.94];
    const tolPx = 12;
    let snappedY = yPct;
    if (dims) {
      const nearest = baselines.reduce(
        (acc, b) => {
          const d = Math.abs((b - yPct) * dims.height * effectiveScale);
          return d < acc.d ? { b, d } : acc;
        },
        { b: yPct, d: Number.POSITIVE_INFINITY }
      );
      if (nearest.d <= tolPx) snappedY = nearest.b;
    }
    const value =
      esignFieldTool === "date"
        ? (activeSigner.role === "host" ? new Date().toISOString().slice(0, 10) : "")
        : esignFieldTool === "signature"
          ? (activeSigner.role === "host" ? adoptedSignaturePreview : "")
          : esignFieldTool === "initials"
            ? (activeSigner.role === "host" ? adoptedInitialsPreview : "")
            : (activeSigner.role === "host" ? (activeSigner.name?.trim() || "") : (activeSigner.name?.trim() || ""));
    const placeholder = esignFieldTool === "text" ? "Printed Name" : esignFieldTool === "date" ? "MM/DD/YYYY" : "";
    const required = esignFieldTool !== "text";
    const nextXPct = Math.max(0, Math.min(1 - base.wPct, xPct));
    const nextYPct = Math.max(0, Math.min(1 - base.hPct, snappedY));
    const adjustedWPct = esignFieldTool === "signature" && snappedY !== yPct ? 0.24 : base.wPct;
    const newField = {
      id: `field_${Date.now()}`,
      type: esignFieldTool,
      signerId: activeSigner.id,
      pageIndex,
      recipientEmail,
      xPct: nextXPct,
      yPct: nextYPct,
      wPct: adjustedWPct,
      hPct: base.hPct,
      value,
      placeholder,
      required,
    };
    setEsignFields((prev) => [...prev, newField]);
    if (esignFieldTool === "signature" && !value.trim() && activeSigner.role === "host") {
      setEsignSignatureModal({ fieldId: newField.id, type: "signature" });
    } else if (esignFieldTool === "initials" && !value.trim() && activeSigner.role === "host") {
      setEsignSignatureModal({ fieldId: newField.id, type: "initials" });
    }
    addEsignActivity(
      `Placed ${esignFieldTool} field on page ${pageIndex + 1} for ${recipientEmail || "unassigned"}`
    );
  };

  const toggleRepeatInitialsForField = (fieldId: string, enabled: boolean) => {
    setEsignFields((prev) => {
      const anchor = prev.find((f) => f.id === fieldId);
      if (!anchor || anchor.type !== "initials") return prev;
      const groupId = anchor.repeatGroupId || `repeat_${anchor.id}`;
      if (!enabled) {
        const next = prev.filter((f) => !(f.isRepeatClone && f.repeatGroupId === groupId));
        return next.map((f) =>
          f.id === anchor.id ? { ...f, repeatGroupId: undefined, isRepeatClone: false } : f
        );
      }

      const pageTotal = Math.max(esignPageCount || 0, 1);
      const byPage = new Set(
        prev
          .filter((f) => f.repeatGroupId === groupId && f.type === "initials")
          .map((f) => f.pageIndex)
      );
      byPage.add(anchor.pageIndex);

      const clones: typeof prev = [];
      for (let page = 0; page < pageTotal; page += 1) {
        if (byPage.has(page)) continue;
        clones.push({
          ...anchor,
          id: `${anchor.id}_p${page}_${Date.now()}`,
          pageIndex: page,
          value: "",
          repeatGroupId: groupId,
          isRepeatClone: true,
        });
      }
      const next = prev.map((f) =>
        f.id === anchor.id ? { ...f, repeatGroupId: groupId, isRepeatClone: false } : f
      );
      return [...next, ...clones];
    });
    addEsignActivity(
      enabled
        ? "Enabled repeat initials on all pages"
        : "Disabled repeat initials on all pages"
    );
  };

  const placeInitialsAtAllSignatureBlocks = () => {
    const assignee = (activeSigner?.email || "").trim();
    const assigneeId = activeSigner?.id;
    if (!assignee) return;
    setEsignFields((prev) => {
      const sigBlocks = prev.filter(
        (f) => f.type === "signature" && (assigneeId ? f.signerId === assigneeId : f.recipientEmail === assignee)
      );
      if (sigBlocks.length === 0) return prev;
      const next = [...prev];
      sigBlocks.forEach((sig) => {
        const hasInitials = next.some(
          (f) =>
            f.type === "initials" &&
            (assigneeId ? f.signerId === assigneeId : f.recipientEmail === assignee) &&
            f.pageIndex === sig.pageIndex &&
            Math.abs(f.xPct - sig.xPct) < 0.02 &&
            Math.abs(f.yPct - sig.yPct) < 0.02
        );
        if (hasInitials) return;
        const wPct = 0.1;
        const hPct = 0.05;
        next.push({
          id: `field_${Date.now()}_${sig.pageIndex}`,
          type: "initials",
          signerId: sig.signerId,
          pageIndex: sig.pageIndex,
          recipientEmail: assignee,
          xPct: Math.max(0, Math.min(1 - wPct, sig.xPct)),
          yPct: Math.max(0, Math.min(1 - hPct, sig.yPct)),
          wPct,
          hPct,
          value: "",
          placeholder: "",
          required: true,
        });
      });
      return next;
    });
    addEsignActivity(`Placed initials at all signature blocks for ${assignee}`);
  };

  const syncAutoFooterInitials = () => {
    const owner = ((esignSigners[0]?.email || esignSigningAsEmail || "")).trim();
    if (!owner || !esignDocFile || esignDocFile.type !== "application/pdf") return;
    const groupId = `auto_footer_${owner.toLowerCase()}`;
    setEsignFields((prev) => {
      const withoutAuto = prev.filter((f) => f.repeatGroupId !== groupId);
      if (!autoPlaceInitialsEveryPage || !adoptedInitialsPreview) return withoutAuto;
      const pageTotal = Math.max(esignPageCount || 0, 0);
      const autoFields = Array.from({ length: pageTotal }, (_, page) => ({
        id: `field_auto_initial_${page}_${Date.now()}`,
        type: "initials" as const,
        signerId: esignSigners[0]?.id,
        pageIndex: page,
        recipientEmail: owner,
        xPct: 0.9,
        yPct: 0.945,
        wPct: 0.08,
        hPct: 0.035,
        value: adoptedInitialsPreview,
        placeholder: "",
        required: false,
        repeatGroupId: groupId,
        isRepeatClone: true,
      }));
      return [...withoutAuto, ...autoFields];
    });
  };

  const deleteSelectedField = () => {
    if (!esignSelectedFieldId) return;
    setEsignFields((prev) => prev.filter((f) => f.id !== esignSelectedFieldId));
    setEsignSelectedFieldId(null);
    setEsignEditingFieldId(null);
  };

  const getEmptyFieldsForMe = () =>
    esignFields.filter(
      (f) =>
        f.recipientEmail === esignSigningAsEmail &&
        !Boolean(f.value && String(f.value).trim())
    );

  const scrollToNextEmptyField = () => {
    const requiredIncomplete = signerIncompleteRequiredFieldsSorted;
    if (requiredIncomplete.length > 0) {
      const currentIdx = currentTargetFieldId
        ? requiredIncomplete.findIndex((f) => f.id === currentTargetFieldId)
        : -1;
      const nextIdx = currentIdx < requiredIncomplete.length - 1 ? currentIdx + 1 : 0;
      const next = requiredIncomplete[nextIdx];
      setTargetField(next.id);
      return;
    }
    const empty = getEmptyFieldsForMe();
    if (empty.length === 0) return;
    const currentIdx = currentTargetFieldId
      ? empty.findIndex((f) => f.id === currentTargetFieldId)
      : -1;
    const nextIdx = currentIdx < empty.length - 1 ? currentIdx + 1 : 0;
    const next = empty[nextIdx];
    setTargetField(next.id);
  };

  const getSignerRequiredTargetList = () => signerRequiredFieldsSorted;
  const getSignerRequiredRemaining = () => signerIncompleteRequiredFieldsSorted.length;

  const scrollToField = (fieldId: string) => {
    if (lastScrolledFieldIdRef.current === fieldId) return;
    const node = document.querySelector(`[data-field-id="${fieldId}"]`) as HTMLElement | null;
    if (!node) return;
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      node.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      lastScrolledFieldIdRef.current = fieldId;
      scrollRafRef.current = 0;
    });
  };

  const goToAdjacentRequiredField = (direction: "next" | "prev") => {
    const list = getSignerRequiredTargetList();
    if (list.length === 0) return;
    const idx = currentTargetFieldId
      ? list.findIndex((f) => f.id === currentTargetFieldId)
      : -1;
    const nextIdx =
      direction === "next"
        ? (idx + 1 + list.length) % list.length
        : (idx - 1 + list.length) % list.length;
    const target = list[nextIdx];
    setTargetField(target.id);
  };

  const startDragBox = (
    e: React.MouseEvent,
    id: string,
    mode: "move" | "resize-se" | "resize-sw" | "resize-ne" | "resize-nw"
  ) => {
    e.stopPropagation();
    const target = esignFields.find((b) => b.id === id);
    if (!target) return;
    setEsignDrag({
      id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startXPct: target.xPct,
      startYPct: target.yPct,
      startWPct: target.wPct,
      startHPct: target.hPct,
      pageIndex: target.pageIndex,
    });
  };

  const onMoveBox = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!esignDrag) return;
    const dims = esignPageDimensions[esignDrag.pageIndex];
    if (!dims) return;
    const renderW = dims.width * effectiveScale;
    const renderH = dims.height * effectiveScale;
    const dxPx = e.clientX - esignDrag.startX;
    const dyPx = e.clientY - esignDrag.startY;
    const dxPct = dxPx / renderW;
    const dyPct = dyPx / renderH;
    const minWPct = 0.05;
    const minHPct = 0.03;
    setEsignFields((prev) =>
      prev.map((b) => {
        if (b.id !== esignDrag.id) return b;
        if (esignDrag.mode === "move") {
          const nextXPct = Math.max(0, Math.min(1 - b.wPct, esignDrag.startXPct + dxPct));
          const nextYPct = Math.max(0, Math.min(1 - b.hPct, esignDrag.startYPct + dyPct));
          return { ...b, xPct: nextXPct, yPct: nextYPct };
        }
        const { mode, startXPct, startYPct, startWPct, startHPct } = esignDrag;
        let x = startXPct, y = startYPct, w = startWPct, h = startHPct;
        if (mode === "resize-se") {
          w = Math.max(minWPct, Math.min(1 - x, startWPct + dxPct));
          h = Math.max(minHPct, Math.min(1 - y, startHPct + dyPct));
        } else if (mode === "resize-sw") {
          const newX = Math.max(0, Math.min(startXPct + startWPct - minWPct, startXPct + dxPct));
          w = startXPct + startWPct - newX;
          x = newX;
          h = Math.max(minHPct, Math.min(1 - y, startHPct + dyPct));
        } else if (mode === "resize-ne") {
          w = Math.max(minWPct, Math.min(1 - x, startWPct + dxPct));
          const newY = Math.max(0, Math.min(startYPct + startHPct - minHPct, startYPct + dyPct));
          h = startYPct + startHPct - newY;
          y = newY;
        } else if (mode === "resize-nw") {
          const newX = Math.max(0, Math.min(startXPct + startWPct - minWPct, startXPct + dxPct));
          w = startXPct + startWPct - newX;
          x = newX;
          const newY = Math.max(0, Math.min(startYPct + startHPct - minHPct, startYPct + dyPct));
          h = startYPct + startHPct - newY;
          y = newY;
        }
        return { ...b, xPct: x, yPct: y, wPct: Math.max(minWPct, w), hPct: Math.max(minHPct, h) };
      })
    );
  };

  const endDragBox = () => {
    setEsignDrag(null);
  };

  const sendEsignInvites = () => {
    if (!esignPacket?.packet_id) {
      setEsignError("Create a packet before sending invites.");
      return;
    }
    const links: Record<string, string> = {};
    esignSigners.forEach((s) => {
      const email = s.email || "";
      if (!email) return;
      links[email] = `Signing link (placeholder): ${window.location.origin}/?esign=1&packet=${esignPacket.packet_id}&signer=${encodeURIComponent(
        email
      )}`;
    });
    setEsignInviteLinks(links);
    setEsignStep("sign");
  };

  const sendEsignInvitesFromModal = () => {
    if (!requiredFieldsComplete(esignSigningAsEmail)) {
      addEsignActivity("Sent before you completed your required fields");
    }
    const links: Record<string, string> = {};
    esignSigners.forEach((s) => {
      const email = s.email || "";
      if (!email) return;
      links[email] = `Signing link (placeholder): ${window.location.origin}/?esign=1&packet=${esignPacket?.packet_id || "local"}&signer=${encodeURIComponent(
        email
      )}`;
    });
    setEsignInviteLinks(links);
    setRecipientStatusByEmail((prev) => {
      const next = { ...prev };
      Object.keys(links).forEach((email) => {
        if (next[email] !== "Signed") next[email] = "Sent";
      });
      return next;
    });
    addEsignActivity(`Sent invite links to ${Object.keys(links).length} recipient(s)`);
    setShowSendModal(false);
    setEsignSideTab("recipients");
    setEsignSentLocked(true);
  };

  const selectedField = esignFields.find((f) => f.id === esignSelectedFieldId);

  const updateField = (id: string, patch: Partial<typeof esignFields[number]>) => {
    setEsignFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...patch } : f))
    );
  };

  const updateBoxValue = (boxId: string, newValue: string, type?: string) => {
    setEsignFields((prev) => {
      let changed = false;
      const next = prev.map((f) => {
        if (f.id !== boxId) return f;
        const current = f.value ?? "";
        if (current === newValue) return f;
        changed = true;
        return { ...f, value: newValue };
      });
      const updated = next.find((f) => f.id === boxId);
      if (DEBUG_ESIGN && updated) {
        console.log("SET_BOX_VALUE", { id: boxId, type: type ?? updated.type, value: newValue });
      }
      return changed ? next : prev;
    });
  };

  useEffect(() => {
    if (phase !== "esign") return;
    const el = outerStableRef.current;
    if (!el) return;

    let rafId = 0;
    const computeFitScale = () => {
      const containerWidth = el.getBoundingClientRect().width;
      if (!containerWidth || !basePageWidth) return;
      const nextFitScale = Math.max(0.1, Math.min(5, containerWidth / basePageWidth));
      // Ignore tiny deltas to prevent ResizeObserver feedback flicker.
      setFitScale((prev) => (Math.abs(prev - nextFitScale) < 0.002 ? prev : nextFitScale));
    };
    const scheduleCompute = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(computeFitScale);
    };

    scheduleCompute();
    const ro = new ResizeObserver(() => scheduleCompute());
    // Observe only the stable outer container, not the scaled wrapper.
    ro.observe(el);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [phase, basePageWidth]);

  useEffect(() => {
    if (phase !== "esign" || esignMode !== "sign") return;
    const required = signerRequiredFieldsSorted;
    if (required.length === 0) {
      setCurrentTargetFieldId(null);
      return;
    }
    const hasCurrent = currentTargetFieldId && required.some((f) => f.id === currentTargetFieldId);
    if (hasCurrent) return;
    const firstIncomplete = required.find((f) => !isFieldComplete(f));
    setCurrentTargetFieldId((firstIncomplete || required[0]).id);
  }, [phase, esignMode, signerRequiredFieldsSorted, currentTargetFieldId]);

  useEffect(() => {
    if (phase !== "esign" || esignMode !== "sign" || !currentTargetFieldId) return;
    scrollToField(currentTargetFieldId);
  }, [phase, esignMode, currentTargetFieldId]);

  useEffect(() => {
    if (phase !== "esign" || esignMode !== "sign" || !currentTargetFieldId) return;
    const target = esignFields.find((f) => f.id === currentTargetFieldId);
    if (!target) return;
    if (target.recipientEmail !== esignSigningAsEmail) return;
    if ((target.type === "text" || target.type === "date") && !isFieldComplete(target)) {
      setEsignEditingFieldId((prev) => (prev === target.id ? prev : target.id));
      const defaultValue =
        target.value ||
        (target.type === "date" ? new Date().toISOString().slice(0, 10) : "");
      setDraftValue(target.id, defaultValue);
    }
  }, [phase, esignMode, currentTargetFieldId, esignFields, esignSigningAsEmail]);

  useEffect(() => {
    if (phase !== "esign" || esignMode !== "sign") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, [contenteditable='true']"))) return;
      e.preventDefault();
      goToAdjacentRequiredField("next");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, esignMode, currentTargetFieldId, esignSigningAsEmail, esignFields]);

  useEffect(() => {
    if (esignMode === "sign") return;
    setShowSignCompleteModal(false);
    lastScrolledFieldIdRef.current = null;
    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = 0;
    }
  }, [esignMode]);

  useEffect(() => {
    lastScrolledFieldIdRef.current = null;
  }, [esignSigningAsEmail]);

  useEffect(() => {
    if (phase !== "esign" || esignMode !== "sign") return;
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    setShowSignRequiredPanel(isDesktop);
  }, [phase, esignMode, esignSigningAsEmail]);

  const [esignExporting, setEsignExporting] = useState(false);
  const handleExportFilledPdf = async () => {
    if (!esignDocFile || esignDocFile.type !== "application/pdf" || esignExporting) return;
    setEsignExporting(true);
    try {
      const buf = await esignDocFile.arrayBuffer();
      const bytes = await exportFilledPdf(buf, esignFields, (msg, data) => {
        if (DEBUG_ESIGN) console.log(msg, data);
      });
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "SignedRecord-filled.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export filled PDF failed:", e);
    } finally {
      setEsignExporting(false);
    }
  };

  useEffect(() => {
    if (phase !== "esign") return;
    const first = esignSigners[0];
    if (first && !activeSignerId) setActiveSignerId(first.id);
    if (first?.email && !esignSigningAsEmail) setEsignSigningAsEmail(first.email);
  }, [phase, esignSigners, activeSignerId, esignSigningAsEmail]);

  useEffect(() => {
    if (phase !== "esign") return;
    const raw = window.sessionStorage.getItem("clawEsignIdentity");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { name?: string; email?: string; signature?: string; initials?: string };
      if (!parsed) return;
      if (parsed.name || parsed.email) {
        setEsignSigners((prev) => {
          const first = prev[0] || { id: `signer_${Date.now()}`, name: "", email: "", role: "host", status: "Not Sent" as const };
          const nextFirst = {
            ...first,
            name: parsed.name ?? first.name,
            email: parsed.email ?? first.email,
            role: "host",
          };
          return [nextFirst, ...prev.slice(1)];
        });
      }
      if (parsed.signature) setEsignSignatureValue(parsed.signature);
      if (parsed.initials) setEsignInitialsValue(parsed.initials);
    } catch {
      // no-op
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== "esign") return;
    const host = esignSigners[0] || { name: "", email: "" };
    window.sessionStorage.setItem(
      "clawEsignIdentity",
      JSON.stringify({
        name: host.name || "",
        email: host.email || "",
        signature: esignSignatureValue || "",
        initials: esignInitialsValue || "",
      })
    );
  }, [phase, esignSigners, esignSignatureValue, esignInitialsValue]);

  useEffect(() => {
    if (phase !== "esign" || esignMode !== "prepare") return;
    const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setEsignFieldTool(null);
          setEsignPlacementHint(null);
          if (esignEditingFieldId) {
            setEsignEditingFieldId(null);
            setEsignDraftById((d) => { const n = { ...d }; delete n[esignEditingFieldId]; return n; });
          } else {
          setEsignSelectedFieldId(null);
        }
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (esignEditingFieldId) return;
        e.preventDefault();
        deleteSelectedField();
        return;
      }
      if (!esignSelectedFieldId || !selectedField) return;
      const dims = esignPageDimensions[selectedField.pageIndex];
      if (!dims) return;
      const nudge = e.shiftKey ? 10 : 1;
      const stepPctX = nudge / (dims.width * effectiveScale);
      const stepPctY = nudge / (dims.height * effectiveScale);
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        updateField(esignSelectedFieldId, { xPct: Math.max(0, selectedField.xPct - stepPctX) });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        updateField(esignSelectedFieldId, { xPct: Math.min(1 - selectedField.wPct, selectedField.xPct + stepPctX) });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        updateField(esignSelectedFieldId, { yPct: Math.max(0, selectedField.yPct - stepPctY) });
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        updateField(esignSelectedFieldId, { yPct: Math.min(1 - selectedField.hPct, selectedField.yPct + stepPctY) });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, esignMode, esignEditingFieldId, esignSelectedFieldId, selectedField, esignPageDimensions, effectiveScale]);

  const requiredFieldsComplete = (email: string) => {
    return esignFields
      .filter((f) => f.recipientEmail === email && f.required)
      .every((f) => {
        if (f.type === "text") return Boolean(f.value && f.value.trim());
        if (f.type === "date") return Boolean(f.value && f.value.trim());
        return true;
      });
  };

  const stampFieldsForSigner = (email: string) => {
    const key = (email || "").toLowerCase();
    const defaults = key ? esignDefaultsByRecipient[key] : undefined;
    const signatureDefault = defaults?.signatureValue || esignSignatureValue;
    const initialsDefault = defaults?.initialsValue || esignInitialsValue;
    setEsignFields((prev) =>
      prev.map((f) => {
        if (f.recipientEmail !== email) return f;
        if (f.type === "signature" && (!f.value || !String(f.value).trim())) {
          return { ...f, value: signatureDefault || "" };
        }
        if (f.type === "initials" && (!f.value || !String(f.value).trim())) {
          return { ...f, value: initialsDefault || "" };
        }
        if (f.type === "date" && (!f.value || !f.value.trim())) {
          return { ...f, value: new Date().toISOString().slice(0, 10) };
        }
        return f;
      })
    );
  };

  const buildLiabilityPayload = () => ({
    attestable_facts: {
      freeform_text: liabilityFactsText.trim(),
    },
    public_legal_context: {
      freeform_text: liabilityLegalContextText.trim(),
      citations: liabilityLegalCitations
        .split(";")
        .map((c) => c.trim())
        .filter(Boolean),
    },
    inclusion: {
      include_public_legal_context_in_bundle: includePublicLegalContext,
      include_private_notes_in_bundle: includePrivateNotes,
    },
    private_notes: liabilityPrivateNotes,
    created_at: createdAt,
    updated_at: liabilityUpdatedAt,
    author: {
      name: liabilityAuthorName,
      role: liabilityAuthorRole,
    },
  });

  const saveLiabilityDraft = async () => {
    try {
      setLiabilityError(null);
      setLiabilityStatus(null);
      if (!liabilityFactsText.trim()) {
        setLiabilityError("Provide attestable facts before saving.");
        return;
      }
      const draft = await postJson("/v1/liability/create_or_update", buildLiabilityPayload());
      setLiabilityPacketSha(draft.packet_sha256);
      setLiabilityStatus("Draft saved. Next: Finalize.");
    } catch (err: any) {
      setLiabilityError(err?.message || "Draft save failed.");
    }
  };

  const finalizeLiability = async () => {
    try {
      setLiabilityError(null);
      setLiabilityStatus(null);
      if (!liabilityFactsText.trim()) {
        setLiabilityError("Provide attestable facts before finalizing.");
        return;
      }
      const draft = await postJson("/v1/liability/create_or_update", buildLiabilityPayload());
      setLiabilityPacketSha(draft.packet_sha256);
      const att = await postJson("/v1/liability/finalize", {
        packet: draft.packet,
        finalized_at: liabilityUpdatedAt,
      });
      setLiability(att);
      setLiabilityStatus(
        "Finalized. Liability attestation ready for bundle export."
      );
    } catch (err: any) {
      setLiabilityError(err?.message || "Finalize failed.");
    }
  };

  const createAgreement = async () => {
    try {
      setAgreementError(null);
      setAgreementStatus(null);
      if (!agreementId || !agreementTitle || !agreementJurisdiction) {
        setAgreementError(
          "Provide agreement_id, title, and jurisdiction before creating."
        );
        return;
      }
      if (!agreementContent || !createdAt) {
        setAgreementError("Provide body text and created_at before creating.");
        return;
      }
      const ag = await postJson("/v1/workflow/agreement/draft", {
        agreement_id: agreementId,
        title: agreementTitle,
        jurisdiction: agreementJurisdiction,
        parties: agreementParties
          .split(";")
          .map((p) => p.trim())
          .filter(Boolean),
        effective_date: agreementEffectiveDate,
        body_markdown: agreementContent,
        created_at: createdAt,
        updated_at: createdAt,
      });
      setAgreement(ag);
      setAgreementRedlines(ag.redlines || []);
      setAgreementStatus(
        "Success: Draft created. Next: Add redline or Export JSON/MD →"
      );
    } catch (err: any) {
      setAgreementError(err?.message || "Draft creation failed.");
    }
  };

  const buildAgreementPacketBody = () => {
    const parties = agreementPartyRows.map((p) => ({
      party_id: p.party_id,
      name: p.name,
      role: p.role,
      contact: p.contact || undefined,
    }));
    const analysis =
      agreementAnalysisText.trim().length > 0
        ? {
            text: agreementAnalysisText.trim(),
            opt_in_party_ids: agreementAnalysisOptInAll
              ? parties.map((p) => p.party_id)
              : [],
            include_in_bundle: agreementAnalysisInclude,
            disclaimer_required: true,
          }
        : null;
    return {
      agreement_id: agreementId || undefined,
      title: agreementTitle,
      parties,
      inclusion: {
        include_diffs_in_bundle: agreementIncludeDiffs,
        include_private_notes_in_bundle: agreementIncludeNotes,
      },
      escrow_reference: agreementEscrowRef.trim()
        ? { provider: "escrow.com", reference: agreementEscrowRef.trim() }
        : null,
      analysis,
      created_at: createdAt,
      updated_at: createdAt,
    };
  };

  const createAgreementPacket = async () => {
    try {
      setAgreementPacketError(null);
      setAgreementPacketStatus(null);
      const packet = await postJson("/v1/agreements/create", buildAgreementPacketBody());
      setAgreementPacket(packet);
      setAgreementPacketStatus("Packet created. Next: Add version.");
    } catch (err: any) {
      setAgreementPacketError(err?.message || "Create packet failed.");
    }
  };

  const addAgreementVersionPacket = async () => {
    try {
      setAgreementPacketError(null);
      setAgreementPacketStatus(null);
      if (!agreementPacket) {
        setAgreementPacketError("Create a packet before adding versions.");
        return;
      }
      if (!agreementAuthorPartyId || !agreementBodyText.trim()) {
        setAgreementPacketError("Provide author_party_id and body text.");
        return;
      }
      const updated = await postJson("/v1/agreements/add_version", {
        packet: agreementPacket,
        author_party_id: agreementAuthorPartyId,
        body_text: agreementBodyText,
        created_at: createdAt,
        content_type: agreementContentType,
        notes: agreementVersionNotes || undefined,
      });
      setAgreementPacket(updated);
      setAgreementPacketStatus("Version added. Next: Finalize.");
    } catch (err: any) {
      setAgreementPacketError(err?.message || "Add version failed.");
    }
  };

  const finalizeAgreementPacket = async () => {
    try {
      setAgreementPacketError(null);
      setAgreementPacketStatus(null);
      if (!agreementPacket) {
        setAgreementPacketError("Create a packet before finalizing.");
        return;
      }
      const att = await postJson("/v1/agreements/finalize", {
        packet: agreementPacket,
        finalized_at: createdAt,
      });
      setAgreement(att);
      setAgreementPacketStatus("Finalized. Agreement attestation ready for export.");
    } catch (err: any) {
      setAgreementPacketError(err?.message || "Finalize failed.");
    }
  };

  const addAgreementRedline = async () => {
    try {
      setAgreementError(null);
      setAgreementStatus(null);
      if (!agreementId) {
        setAgreementError("Create a draft before adding redlines.");
        return;
      }
      if (!redlineText || !redlineAuthor || !redlineCreatedAt) {
        setAgreementError(
          "Provide change_text, author, and created_at before adding redlines."
        );
        return;
      }
      const updated = await postJson("/v1/workflow/agreement/redline", {
        agreement_id: agreementId,
        change_text: redlineText,
        rationale: redlineRationale,
        author: redlineAuthor,
        created_at: redlineCreatedAt,
      });
      setAgreement(updated);
      setAgreementRedlines(updated.redlines || []);
      setAgreementStatus("Success: Redline added. Next: Export JSON/MD →");
    } catch (err: any) {
      setAgreementError(err?.message || "Add redline failed.");
    }
  };

  const exportAgreement = async () => {
    try {
      setAgreementError(null);
      setAgreementStatus(null);
      if (!agreementId) {
        setAgreementError("Provide agreement_id before exporting.");
        return;
      }
      const exported = await postJson("/v1/workflow/agreement/export", {
        agreement_id: agreementId,
      });
      const jsonBlob = new Blob([exported.agreement_json], {
        type: "application/json",
      });
      const mdBlob = new Blob([exported.agreement_markdown], {
        type: "text/markdown",
      });
      const jsonUrl = URL.createObjectURL(jsonBlob);
      const mdUrl = URL.createObjectURL(mdBlob);
      setAgreementExport({
        ...exported,
        json_url: jsonUrl,
        md_url: mdUrl,
      });
      setAgreementStatus(
        "Success: Export ready. Next: Attach to bundle or share →"
      );
    } catch (err: any) {
      setAgreementError(err?.message || "Export failed.");
    }
  };

  const saveAgreementVersion = async () => {
    try {
      setAgreementError(null);
      setAgreementStatus(null);
      const disclaimers = [
        "Draft / non-binding by default.",
        "No legal advice.",
        "Verify jurisdictional enforceability separately.",
      ];
      const res = await postJson("/v1/workflow/agreement/save_version", {
        agreement_id: agreementId,
        title: agreementTitle,
        body_markdown: agreementContent,
        created_at: createdAt,
        disclaimers,
      });
      setAgreementStatus(
        `Saved version v${res.version}. Next: Generate redline or export.`
      );
      await loadAgreementVersions();
    } catch (err: any) {
      setAgreementError(err?.message || "Save version failed.");
    }
  };

  const loadAgreementVersions = async () => {
    if (!agreementId) return;
    const res = await fetch(
      `${API_BASE}/v1/workflow/agreement/versions?agreement_id=${encodeURIComponent(
        agreementId
      )}`
    );
    if (!res.ok) {
      setAgreementError(await res.text());
      return;
    }
    const payload = await res.json();
    const versions = payload.versions || [];
    setAgreementVersions(versions);
    if (versions.length > 0) {
      const latest = String(versions[0].version);
      setAgreementVersionToExport(latest);
      if (!toVersion) setToVersion(latest);
      if (!fromVersion && versions.length > 1) {
        setFromVersion(String(versions[1].version));
      }
    }
  };

  const generateAgreementDiff = async () => {
    try {
      setAgreementError(null);
      if (!fromVersion || !toVersion) {
        setAgreementError("Select both from_version and to_version.");
        return;
      }
      const res = await postJson("/v1/workflow/agreement/diff", {
        agreement_id: agreementId,
        from_version: Number(fromVersion),
        to_version: Number(toVersion),
      });
      setDiffText(res.diff_text || "");
      setDiffSha256(res.diff_sha256 || "");
      setAgreementStatus("Redline generated. You can include it in export.");
    } catch (err: any) {
      setAgreementError(err?.message || "Generate redline failed.");
    }
  };

  const createDispute = async () => {
    const packet = await postJson("/v1/workflow/dispute/create", {
      claims: JSON.parse(claims),
      references: JSON.parse(references),
      timelines: JSON.parse(timelines),
      created_at: createdAt,
    });
    setDispute(packet);
  };

  const exportBundle = async () => {
    if (!timeline || !receipt || !esign || !liability) {
      setExportResult("Missing required artifacts.");
      return;
    }
    if (attachAgreement && !agreement) {
      setExportResult("Attach toggle is on but no agreement is loaded.");
      return;
    }
    const res = await fetch(`${API_BASE}/v1/workflow/bundle/export_zip`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        out_dir: exportDir,
        created_at: createdAt,
        timeline,
        receipt,
        attestations: [esign, liability],
        agreement: attachAgreement ? agreement : null,
        analysis: null,
        note: "workflow_export",
        agreement_id: agreementId,
        agreement_version: includeAgreementVersion
          ? Number(agreementVersionToExport || 0) || null
          : null,
        agreement_diff: includeDiff
          ? {
              from_version: Number(fromVersion),
              to_version: Number(toVersion),
            }
          : null,
      }),
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "claw-bundle-v0.zip";
    a.click();
    URL.revokeObjectURL(url);
    setExportResult(
      prettyJson({
        ok: true,
        note: "Bundle zip downloaded.",
      })
    );
  };

  const saveBundleDir = async () => {
    if (!timeline || !receipt || !esign || !liability) {
      setExportResult("Missing required artifacts.");
      return;
    }
    if (attachAgreement && !agreement) {
      setExportResult("Attach toggle is on but no agreement is loaded.");
      return;
    }
    const resp = await postJson("/v1/workflow/bundle/export", {
      out_dir: exportDir,
      created_at: createdAt,
      timeline,
      receipt,
      attestations: [esign, liability],
      agreement: attachAgreement ? agreement : null,
      analysis: null,
      note: "workflow_export",
      agreement_id: agreementId,
      agreement_version: includeAgreementVersion
        ? Number(agreementVersionToExport || 0) || null
        : null,
      agreement_diff: includeDiff
        ? {
            from_version: Number(fromVersion),
            to_version: Number(toVersion),
          }
        : null,
    });
    setExportResult(prettyJson(resp));
  };

  const runVerify = async () => {
    try {
      setVerifyError(null);
      setVerifyReport(null);
      if (!verifyFiles || verifyFiles.length === 0) {
        setVerifyError("No files selected.");
        return;
      }
      const zip = verifyFiles.item(0);
      if (!zip) {
        setVerifyError("No zip selected.");
        return;
      }
      const form = new FormData();
      form.append("bundle_zip", zip);
      const res = await fetch(`${API_BASE}/v1/workflow/bundle/verify`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const report = (await res.json()) as VerifyReport;
      setVerifyReport(report);
    } catch (err: any) {
      setVerifyError(err?.message || "Verification failed.");
    }
  };

  const hasTimelineEvent = Boolean((timeline?.events || []).length);
  const hasTimeline = Boolean(timeline);
  const canFreezeTimeline = hasTimelineEvent;
  const liabilityHasDraft = Boolean(liabilityPacketSha);
  const agreementHasVersions = Boolean(
    (agreementPacket?.versions || []).length
  );
  const esignPreviewHeight = esignMode === "sign" ? 620 : 420;
  const showLegacyEsignStacks = false;
  const activeSigner = esignSigners.find((s) => s.id === activeSignerId) || esignSigners[0] || null;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isValidEmail = (email: string) => emailRegex.test((email || "").trim());
  const getEmailError = (email: string) => {
    const v = (email || "").trim();
    if (!v) return "Email is required";
    return isValidEmail(v) ? "" : "Enter a valid email";
  };
  const signerOption = esignSigners.find((s) => s.email === esignSigningAsEmail);
  const signingDisplayName = signerOption?.name?.trim() || esignSigningAsEmail || "Signer";
  const adoptedSignaturePreview = (esignSignatureValue || signingDisplayName || "").trim();
  const adoptedInitialsPreview = (esignInitialsValue || deriveInitials(signingDisplayName)).trim();
  const allFieldsSorted = useMemo(
    () =>
      [...esignFields].sort((a, b) => {
        if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
        if (a.yPct !== b.yPct) return a.yPct - b.yPct;
        return a.xPct - b.xPct;
      }),
    [esignFields]
  );
  const canSendNow =
    esignSigners.filter((s) => Boolean((s.email || "").trim())).length > 0 &&
    (allowNoRecipientFieldsRequired ||
      esignSigners
        .filter((s) => Boolean((s.email || "").trim()))
        .every((s) => esignFields.some((f) => f.recipientEmail === s.email && Boolean(f.required))));
  const senderCanSignNow = Boolean(
    esignFields.some((f) => f.recipientEmail === esignSigningAsEmail && Boolean(f.required))
  );
  const signerChecklist: string[] = [];
  if (!esignDocFile) signerChecklist.push("Upload a document");
  if (!esignPageCount) signerChecklist.push("Load PDF pages");
  const invalidEmails = esignSigners.filter((s) => !isValidEmail(s.email));
  if (invalidEmails.length > 0) signerChecklist.push("Fix signer email addresses");
  const missingRequiredBySigner = esignSigners.filter((s) => {
    const required = esignFields.filter((f) => f.recipientEmail === s.email && Boolean(f.required));
    if (s.role === "signer") {
      return !required.some((f) => f.type === "signature" || f.type === "initials");
    }
    return required.length === 0;
  });
  if (missingRequiredBySigner.length > 0) signerChecklist.push("Add required signature/initials fields for each signer");
  const canProceedReview = signerChecklist.length === 0;
  const canReviewAndSend = canProceedReview && canSendNow;
  const signerColorClass = (email: string) => {
    const idx = Math.max(0, esignSigners.findIndex((s) => s.email === email));
    const palette = [
      { bg: "bg-sky-400/8", text: "text-sky-100", border: "border-sky-400/70", dash: "border-sky-500/60", badge: "bg-sky-400/20 text-sky-200" },
      { bg: "bg-emerald-400/8", text: "text-emerald-200", border: "border-emerald-400/70", dash: "border-emerald-500/60", badge: "bg-emerald-400/20 text-emerald-200" },
      { bg: "bg-violet-400/8", text: "text-violet-100", border: "border-violet-400/70", dash: "border-violet-500/60", badge: "bg-violet-400/20 text-violet-200" },
      { bg: "bg-amber-400/8", text: "text-amber-100", border: "border-amber-400/70", dash: "border-amber-500/60", badge: "bg-amber-400/20 text-amber-200" },
    ];
    return palette[idx % palette.length];
  };
  const fieldBelongsToSigner = (f: typeof esignFields[number], s: typeof esignSigners[number]) =>
    (f.signerId ? f.signerId === s.id : f.recipientEmail === s.email);

  useEffect(() => {
    syncAutoFooterInitials();
  }, [autoPlaceInitialsEveryPage, esignPageCount, esignActiveRecipientEmail, esignSigningAsEmail, adoptedInitialsPreview, esignDocFile]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className={`${phase === "esign" ? "max-w-[1440px]" : "max-w-5xl"} mx-auto px-4 py-6 space-y-6`}>
        {phase !== "landing" && (
          <header className="flex items-center justify-between">
            <div>
              <div className="text-2xl font-semibold">CLAW</div>
              <div className="mt-1 text-xs text-slate-400">
                Connected to: {API_BASE}
                {apiVersion?.protocol_version && apiVersion?.api_version
                  ? ` • Protocol ${apiVersion.protocol_version} • API ${apiVersion.api_version}`
                  : ""}
                {backendOnline === false ? " • Backend: Offline" : ""}
              </div>
            </div>
            {backendOnline === false && (
              <span className="rounded-full border border-amber-700/60 bg-amber-950/50 px-2 py-1 text-[11px] text-amber-300">
                Disconnected
              </span>
            )}
            <button
              className="btn"
              onClick={() =>
                setPhase(phase === "chooser" ? "landing" : "chooser")
              }
            >
              Back
            </button>
          </header>
        )}

        {phase === "landing" && (
          <section className="rounded-xl border border-slate-800 p-6 space-y-6 text-center">
            <h1 className="text-4xl font-semibold">CLAW</h1>
            <p className="text-sm text-slate-300">
              CLAW lets you turn real-world events, statements, and agreements into verifiable records that can’t be altered.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button className="btn" onClick={() => setPhase("chooser")}>
                Start a new record
              </button>
              <button className="btn" onClick={() => setPhase("verify")}>
                Verify an existing record
              </button>
            </div>
          </section>
        )}

        {phase === "chooser" && (
          <section className="rounded-xl border border-slate-800 p-6 space-y-4">
            <h2 className="text-lg font-semibold">What are you creating?</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button className="btn" onClick={() => setPhase("timeline")}>
                Timeline of events
              </button>
              <button className="btn" onClick={() => setPhase("esign")}>
                Signed statement (E-Sign)
              </button>
              <button className="btn" onClick={() => setPhase("liability")}>
                Liability attestation
              </button>
              <button className="btn" onClick={() => setPhase("agreement")}>
                Agreement
              </button>
            </div>
          </section>
        )}


        {(phase === "timeline" || phase === "esign" || phase === "liability") && (
          <>
        {SHOW_DEMOS && (
        <section className="rounded-xl border border-slate-800 p-4 space-y-3">
          <h2 className="text-lg font-semibold">One-click Demo</h2>
          <label className="text-xs text-slate-300">
            Demo Mode
            <select
              className="ml-2 rounded bg-slate-900 border border-slate-800 px-2 py-1 text-xs"
              value={demoMode}
              onChange={(e) =>
                setDemoMode(
                  e.target.value as
                    | "Full Bundle"
                    | "Timeline only"
                    | "Agreement only"
                    | "Analyst only"
                )
              }
            >
              <option>Full Bundle</option>
              <option>Timeline only</option>
              <option>Agreement only</option>
              <option>Analyst only</option>
            </select>
          </label>
          <label className="text-xs text-slate-300 flex items-center gap-2">
            <input
              type="checkbox"
              checked={demoReproduce}
              onChange={(e) => setDemoReproduce(e.target.checked)}
            />
            Reproduce (fixed inputs)
          </label>
          {demoReproduce && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                className="rounded bg-slate-900 border border-slate-800 px-2 py-1 text-xs"
                value={demoCreatedAt}
                onChange={(e) => setDemoCreatedAt(e.target.value)}
                placeholder="created_at"
              />
              <input
                className="rounded bg-slate-900 border border-slate-800 px-2 py-1 text-xs"
                value={demoEpochId}
                onChange={(e) => setDemoEpochId(e.target.value)}
                placeholder="epoch_id"
              />
              <input
                className="rounded bg-slate-900 border border-slate-800 px-2 py-1 text-xs"
                value={demoTimelineId}
                onChange={(e) => setDemoTimelineId(e.target.value)}
                placeholder="timeline_id"
              />
              <input
                className="rounded bg-slate-900 border border-slate-800 px-2 py-1 text-xs"
                value={demoAnchorNetwork}
                onChange={(e) => setDemoAnchorNetwork(e.target.value)}
                placeholder="anchor_network"
              />
            </div>
          )}
          <button className="btn" onClick={runDemo} disabled={demoRunning}>
            {demoRunning ? "Running..." : "Run Demo"}
          </button>
          <button className="btn" onClick={resetDemoState}>
            Reset Demo State
          </button>
          {demoMode === "Full Bundle" && (
            <div className="flex flex-wrap gap-2 text-xs">
              <button className="btn" onClick={copyDemoPayload}>
                Copy JSON payload
              </button>
              <button
                className="btn"
                onClick={() =>
                  copyToClipboard(
                    `curl -s -X POST "${API_BASE}/v1/workflow/demo/run?format=zip" -H "content-type: application/json" -d '${JSON.stringify(
                      getDemoInputs(),
                      null,
                      0
                    )}' -o bundle.zip`
                  )
                }
              >
                Copy demo/run curl
              </button>
              <button className="btn" onClick={copyVerifyCurl}>
                Copy verify curl
              </button>
            </div>
          )}
          {demoError && (
            <div className="text-sm text-rose-300 whitespace-pre-wrap">
              {demoError}
            </div>
          )}
          {demoZipUrl && (
            <a className="text-sm text-emerald-300 underline" href={demoZipUrl || ""} download="claw-bundle-v0.zip">
              Download bundle.zip
            </a>
          )}
          {demoLog.length > 0 && (
            <pre className="text-xs bg-slate-900 border border-slate-800 rounded p-2 overflow-auto">
              {demoLog.join("\n")}
            </pre>
          )}
          {demoSummary && (
            <div className="text-xs bg-slate-900 border border-slate-800 rounded p-2 overflow-auto">
              <div className="font-semibold text-slate-200 mb-1">Proof Summary</div>
              <pre>{prettyJson(demoSummary)}</pre>
            </div>
          )}
          {demoVerify && (
            <div className="text-xs bg-slate-900 border border-slate-800 rounded p-2">
              <div className="font-semibold text-slate-200 mb-1">Verification Checks</div>
              <ul className="space-y-1">
                {(demoVerify?.checks || []).map((c, idx) => (
                  <li key={idx} className={c.ok ? "text-emerald-300" : "text-rose-300"}>
                    {c.ok ? "PASS" : "FAIL"} — {c.name}
                    {c.detail ? ` (${c.detail})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="text-xs bg-slate-900 border border-slate-800 rounded p-2 space-y-2">
            <div className="font-semibold text-slate-200">Tamper Lab (Hostile Verifier)</div>
            <div className="text-slate-400">
              Any byte change causes verification to fail (either hash mismatch or invalid zip).
            </div>
            <div className="flex gap-2">
              <button className="btn" onClick={verifyUntampered}>
                Verify Untampered (PASS)
              </button>
              <button className="btn" onClick={simulateTamper}>
                Simulate Tamper (FAIL)
              </button>
              {lastTamperedZipBlob && (
                <button className="btn" onClick={verifyTampered}>
                  Verify Tampered (FAIL)
                </button>
              )}
            </div>
            {tamperError && (
              <div className="text-rose-300">{tamperError}</div>
            )}
            {tamperReport && (
              <div className="space-y-1">
                <div className={tamperReport?.ok ? "text-emerald-300" : "text-rose-300"}>
                  {tamperLabel || "Result"}: {tamperReport?.ok ? "PASS" : "FAIL"}
                </div>
                <ul className="space-y-1">
                  {(tamperReport?.checks || []).map((c, idx) => (
                    <li key={idx} className={c.ok ? "text-emerald-300" : "text-rose-300"}>
                      {c.ok ? "PASS" : "FAIL"} — {c.name}
                      {c.detail ? ` (${c.detail})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {demoMode === "Full Bundle" && (
            <div className="text-xs text-slate-400">
              Uses `/v1/workflow/demo/run` for single-call demo and
              `/v1/workflow/bundle/verify` for verification.
            </div>
          )}
        </section>
        )}
        {phase === "timeline" && (
        <section className="rounded-xl border border-slate-800 p-4 space-y-3">
          <h2 className="text-lg font-semibold">Timeline</h2>
          <div className="rounded-md border border-slate-800 bg-slate-900/40 p-2 text-xs text-slate-300">
            <div className="font-semibold text-slate-200">What this does</div>
            Capture events, freeze a manifest hash, and create a receipt for
            later verification.
            <div className="mt-1 font-semibold text-slate-200">When to use</div>
            Use this to create an evidence timeline before exporting a bundle.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
              value={timelineId}
              onChange={(e) => setTimelineId(e.target.value)}
              placeholder="timeline_id"
            />
            <input
              className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
              value={timelineTitle}
              onChange={(e) => setTimelineTitle(e.target.value)}
              placeholder="title"
            />
            <input
              className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
              value={createdAt}
              onChange={(e) => setCreatedAt(e.target.value)}
              placeholder="created_at"
            />
            <input
              className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
              placeholder="event_time"
            />
            <input
              className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
              value={noticeText}
              onChange={(e) => setNoticeText(e.target.value)}
              placeholder="notice text"
            />
          </div>
          {canFreezeTimeline && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
                value={frozenAt}
                onChange={(e) => setFrozenAt(e.target.value)}
                placeholder="frozen_at"
              />
              <input
                className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
                value={anchorNetwork}
                onChange={(e) => setAnchorNetwork(e.target.value)}
                placeholder="anchor_network"
              />
              <input
                className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
                value={epochId}
                onChange={(e) => setEpochId(e.target.value)}
                placeholder="epoch_id"
              />
              <input
                className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
                value={issuedAt}
                onChange={(e) => setIssuedAt(e.target.value)}
                placeholder="issued_at"
              />
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn" onClick={createTimeline}>
              Create
            </button>
            {hasTimeline && (
              <button className="btn" onClick={appendEvent}>
                Append
              </button>
            )}
            {canFreezeTimeline && (
              <button className="btn" onClick={freezeTimeline}>
                Freeze
              </button>
            )}
          </div>
          {!hasTimeline && (
            <div className="text-xs text-slate-400">
              Create the timeline before appending events.
            </div>
          )}
          {hasTimeline && !canFreezeTimeline && (
            <div className="text-xs text-slate-400">
              Append at least one event to enable Freeze.
            </div>
          )}
          {timelineError && (
            <div className="text-xs text-rose-300">{timelineError}</div>
          )}
          {timelineFrozen && (
            <div className="text-xs text-amber-300">
              This timeline is sealed. Create a new version to add events.
              <div className="mt-2">
                <button className="btn" onClick={forkTimeline}>
                  Create Timeline v2
                </button>
              </div>
            </div>
          )}
          {timelineStatus && (
            <div className="text-xs text-emerald-300">{timelineStatus}</div>
          )}
          <pre className="text-xs bg-slate-900 border border-slate-800 rounded p-2 overflow-auto">
            {prettyJson(timeline)}
          </pre>
          <pre className="text-xs bg-slate-900 border border-slate-800 rounded p-2 overflow-auto">
            {prettyJson(receipt)}
          </pre>
        </section>
        )}

        {phase === "esign" && (
        <section className={`rounded-xl border border-slate-800 ${esignMode === "sign" ? "p-3 space-y-3" : "p-4 space-y-4"}`}>
          <h2 className="text-lg font-semibold">Signed Record</h2>
          {esignMode !== "sign" && (
            <div className="text-xs text-slate-400">
              Evidence-only. Does not enforce outcomes.
            </div>
          )}
          {esignDocFile && (
            <div className="flex flex-wrap items-center gap-4 py-2 border-b border-slate-700 text-sm">
              <div className="flex items-center gap-2 text-xs">
                <span className={`${esignSigners.length > 0 ? "text-emerald-400 font-medium" : "text-slate-500"}`}>1. Add Signers</span>
                <span className="text-slate-600">→</span>
                <span className={`${esignFields.length > 0 ? "text-emerald-400 font-medium" : "text-slate-500"}`}>2. Place Fields</span>
                <span className="text-slate-600">→</span>
                <span className="text-slate-500">{esignSigners.length <= 1 ? "3. Finish & Download" : "3. Review & Send"}</span>
              </div>
              {esignSigners.length > 0 && (
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    className="btn text-xs lg:hidden"
                    onClick={() => setMobileSidePanelOpen(true)}
                  >
                    Panel
                  </button>
                  {esignDocFile.type === "application/pdf" && esignMode !== "sign" && (
                    <button
                      type="button"
                      className="btn text-xs"
                      disabled={esignExporting}
                      onClick={handleExportFilledPdf}
                    >
                      {esignExporting ? "Exporting…" : "Export filled PDF"}
                    </button>
                  )}
                  {esignMode === "prepare" && (
                    <>
                      {esignSentLocked ? (
                        <button
                          type="button"
                          className="btn text-xs"
                          onClick={() => {
                            const ok = window.confirm(
                              "Edit & resend will invalidate current invite links. Continue?"
                            );
                            if (!ok) return;
                            setEsignSentLocked(false);
                            setEsignInviteLinks({});
                            addEsignActivity("Unlocked prepare mode for edit & resend");
                          }}
                        >
                          Edit & resend
                        </button>
                      ) : null}
                      {esignSigners.filter((s) => Boolean((s.email || "").trim())).length <= 1 ? (
                        <button
                          type="button"
                          className={`btn text-xs ${canProceedReview ? "bg-emerald-600 hover:bg-emerald-500" : "opacity-60 cursor-not-allowed"}`}
                          onClick={handleExportFilledPdf}
                          disabled={esignExporting || !canProceedReview}
                        >
                          {esignExporting ? "Exporting…" : "Finish & Download"}
                        </button>
                      ) : (
                        <>
                          <button
                            data-testid="send-button"
                            type="button"
                            className={`btn text-xs ${canReviewAndSend && !esignSentLocked ? "bg-emerald-600 hover:bg-emerald-500" : "opacity-60 cursor-not-allowed"}`}
                            disabled={!canReviewAndSend || esignSentLocked}
                            onClick={() => setShowSendModal(true)}
                          >
                            Send for signature
                          </button>
                          <button
                            data-testid="sign-now-button"
                            type="button"
                            className={`btn text-xs ${senderCanSignNow ? "" : "opacity-70"}`}
                            onClick={() => setEsignMode("sign")}
                          >
                            Review fields
                          </button>
                        </>
                      )}
                      {!canReviewAndSend && (
                        <span className="text-[11px] text-slate-400">
                          Complete all review checks before sending.
                        </span>
                      )}
                      {allowNoRecipientFieldsRequired && (
                        <span className="text-[11px] text-slate-400">
                          Recipient required-field check bypassed.
                        </span>
                      )}
                      {signerChecklist.length > 0 && (
                        <div className="rounded border border-slate-700 bg-slate-900/50 px-2 py-1 text-[11px] text-slate-300">
                          {signerChecklist.map((item) => (
                            <div key={item}>- {item}</div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {esignDocFile.type === "application/pdf" && esignMode !== "sign" && (
                    <div className="flex items-center gap-1 rounded-lg border border-slate-700 p-0.5">
                      <button type="button" className="btn text-xs px-2 py-1" onClick={() => setUserZoom(1)}>Fit</button>
                      <button
                        type="button"
                        className="btn text-xs px-2 py-1"
                        onClick={() => setUserZoom(Math.max(0.5, Math.min(2.5, 1 / Math.max(fitScale, 0.1))))}
                      >
                        100%
                      </button>
                      <button
                        type="button"
                        className="btn text-xs px-2 py-1"
                        onClick={() => setUserZoom((z) => Math.max(0.5, Math.min(2.5, z - 0.1)))}
                      >
                        -
                      </button>
                      <button
                        type="button"
                        className="btn text-xs px-2 py-1"
                        onClick={() => setUserZoom((z) => Math.max(0.5, Math.min(2.5, z + 0.1)))}
                      >
                        +
                      </button>
                      <span className="px-1 text-[11px] text-slate-300 min-w-[46px] text-right">
                        {Math.round(effectiveScale * 100)}%
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    className={`btn text-xs ml-1 ${esignMode === "sign" ? "bg-emerald-600 hover:bg-emerald-500" : ""}`}
                    onClick={() => setEsignMode((m) => (m === "prepare" ? "sign" : "prepare"))}
                  >
                    {esignMode === "prepare" ? "Review & Send" : "Back to Placement"}
                  </button>
                </div>
              )}
            </div>
          )}

          {esignMode === "sign" && esignDocFile && (
            <>
              <div className="rounded-md border border-slate-700 bg-slate-900/90 px-3 py-2">
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
                  <div className="flex items-center gap-2">
                    <div className="rounded border border-slate-700 bg-slate-950/70 px-2 py-1">
                      <div className="text-[10px] text-slate-400">👤 You are signing as</div>
                      <button
                        type="button"
                        className="text-xs font-medium text-slate-100 hover:text-emerald-300"
                        onClick={() => setShowIdentityModal(true)}
                        title="Edit identity"
                      >
                        {signingDisplayName} ✎
                      </button>
                    </div>
                    <span className="text-xs text-slate-300">Signing as</span>
                    <select
                      className="rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs"
                      value={esignSigningAsEmail}
                      onChange={(e) => setEsignSigningAsEmail(e.target.value)}
                    >
                      {esignSigners.map((s, idx) => (
                        <option key={s.email || idx} value={s.email}>
                          {s.name?.trim() || `Signer ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                    <span className="text-[11px] text-slate-400">
                      Signature: {adoptedSignaturePreview ? "set" : "not set"}
                    </span>
                    <button
                      type="button"
                      className="btn text-xs"
                      onClick={() => setEsignSignatureModal({ type: "signature" })}
                    >
                      Edit
                    </button>
                    <span className="text-[11px] text-slate-400">
                      Initials: {adoptedInitialsPreview ? "set" : "not set"}
                    </span>
                    <button
                      type="button"
                      className="btn text-xs"
                      onClick={() => setEsignSignatureModal({ type: "initials" })}
                    >
                      Edit
                    </button>
                  </div>
                  <div data-testid="required-remaining" className="text-xs text-amber-300 lg:text-center">
                    {getSignerRequiredRemaining() === 0
                      ? "All required fields complete"
                      : `${getSignerRequiredRemaining()} required fields remaining`}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    {esignDocFile.type === "application/pdf" && (
                      <div className="flex items-center gap-1 rounded-lg border border-slate-700 p-0.5">
                        <button type="button" className="btn text-xs px-2 py-1" onClick={() => setUserZoom(1)}>Fit</button>
                        <button
                          type="button"
                          className="btn text-xs px-2 py-1"
                          onClick={() => setUserZoom(Math.max(0.5, Math.min(2.5, 1 / Math.max(fitScale, 0.1))))}
                        >
                          100%
                        </button>
                        <button
                          type="button"
                          className="btn text-xs px-2 py-1"
                          onClick={() => setUserZoom((z) => Math.max(0.5, Math.min(2.5, z - 0.1)))}
                        >
                          -
                        </button>
                        <button
                          type="button"
                          className="btn text-xs px-2 py-1"
                          onClick={() => setUserZoom((z) => Math.max(0.5, Math.min(2.5, z + 0.1)))}
                        >
                          +
                        </button>
                        <span className="px-1 text-[11px] text-slate-300 min-w-[46px] text-right">
                          {Math.round(effectiveScale * 100)}%
                        </span>
                      </div>
                    )}
                    <button
                      data-testid="download-pdf"
                      type="button"
                      className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-slate-500 hover:text-slate-100"
                      onClick={handleExportFilledPdf}
                    >
                      Download PDF
                    </button>
                  </div>
                </div>
              </div>
              <div data-testid="signer-topbar" className="sticky top-0 z-[120] rounded-md border border-slate-700 bg-slate-900/95 px-3 py-2 backdrop-blur">
                <div className="flex flex-wrap items-center gap-2">
                  {getSignerRequiredRemaining() > 0 && (
                    <button type="button" className="btn text-xs" onClick={jumpToFirstIncompleteRequiredField}>
                      Start
                    </button>
                  )}
                  <button type="button" className="btn text-xs" onClick={() => goToAdjacentRequiredField("prev")}>
                    Prev
                  </button>
                  <button data-testid="required-next" type="button" className="btn text-xs" onClick={() => goToAdjacentRequiredField("next")}>
                    Next
                  </button>
                  <button type="button" className="btn text-xs text-slate-300" onClick={() => setEsignSignatureModal({ type: "signature" })}>
                    Edit signature
                  </button>
                  <button type="button" className="btn text-xs text-slate-300" onClick={() => setEsignSignatureModal({ type: "initials" })}>
                    Edit initials
                  </button>
                  <button
                    data-testid="complete-signing"
                    type="button"
                    className={`ml-auto rounded px-4 py-2 text-sm font-semibold transition ${
                      getSignerRequiredRemaining() === 0
                        ? "bg-emerald-600 text-white hover:bg-emerald-500"
                        : "bg-slate-700 text-slate-300 opacity-75 cursor-not-allowed"
                    }`}
                    disabled={getSignerRequiredRemaining() !== 0}
                    onClick={() => setShowSignCompleteModal(true)}
                  >
                    Finish
                  </button>
                </div>
                {getSignerRequiredRemaining() !== 0 && (
                  <div className="mt-1 text-[11px] text-slate-400">
                    Complete all required fields to finish.
                  </div>
                )}
              </div>
            </>
          )}

          <div className="rounded-md border border-slate-800 p-3 space-y-3">
            <div className="font-semibold text-slate-200">
              {esignMode === "sign" ? "Document Preview" : "Upload & Preview"}
            </div>
            {esignMode !== "sign" && (
              <div className="flex items-center gap-2">
                <label className="btn text-xs cursor-pointer">
                  Choose document
                  <input
                    type="file"
                    accept=".pdf,application/pdf,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.item(0) || null;
                      setEsignDocFile(file);
                      setEsignStep(file ? "signers" : "upload");
                      setEsignPacket(null);
                      if (DEBUG_ESIGN && file) console.log("REPLACE_BOXES", "new_file_upload", 0);
                      setEsignFields([]);
                      setEsignInviteLinks({});
                      setEsignCompletedByEmail([]);
                      setEsignPdfError(null);
                      setEsignPageCount(0);
                      setEsignPageDimensions({});
                    }}
                  />
                </label>
                <span className="text-xs text-slate-400 truncate">
                  {esignDocFile ? esignDocFile.name : "No document selected"}
                </span>
              </div>
            )}
            {esignDocFile && (
              <div className="rounded border border-slate-800 bg-slate-900/40 p-2">
                {/* Prepare: toolbar, active recipient, Fields counter */}
                {esignMode === "prepare" && (
                  <div className="flex flex-wrap items-center gap-3 mb-2 pb-2 border-b border-slate-700">
                    <span className="text-xs font-medium text-slate-300">Active signer:</span>
                    <span className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100">
                      {activeSigner?.name?.trim() || activeSigner?.email || "Select signer in right panel"}
                    </span>
                    <span className="text-slate-500">|</span>
                    <span className="text-xs text-slate-400">Tools:</span>
                    {(["signature", "initials", "text", "date"] as const).map((t) => (
                      <button
                        key={t}
                        className={`btn text-xs ${esignFieldTool === t ? "ring-2 ring-emerald-400" : ""} ${esignSentLocked || !activeSigner || !isValidEmail(activeSigner.email) ? "opacity-60 cursor-not-allowed" : ""}`}
                        disabled={esignSentLocked || !activeSigner || !isValidEmail(activeSigner.email)}
                        onClick={() => {
                          setEsignFieldTool(t);
                          setEsignPlacementHint(null);
                        }}
                      >
                        {t === "signature" ? "Signature" : t === "initials" ? "Initials" : t === "date" ? "Date" : "Printed Name"}
                      </button>
                    ))}
                    <span className="text-slate-500">|</span>
                    <span className="text-xs font-medium text-emerald-300">Fields: {esignFields.length}</span>
                    <span className="text-xs text-slate-400">
                      {!activeSigner
                        ? "Select a signer in the right panel to place fields."
                        : !isValidEmail(activeSigner.email)
                          ? "Add a valid signer email before placing fields."
                          : esignFieldTool
                            ? (esignPlacementHint ?? `Click on document to place ${esignFieldTool === "signature" ? "Signature" : esignFieldTool === "initials" ? "Initials" : esignFieldTool === "date" ? "Date" : "Printed Name"} for ${activeSigner.name || "signer"}`)
                            : "Select a tool, then click on document to place."}
                    </span>
                  </div>
                )}
                <div className={`grid grid-cols-1 ${esignMode === "sign" ? "lg:grid-cols-[1fr,260px]" : "lg:grid-cols-[1fr,220px]"} gap-3`}>
                <div
                  ref={esignPreviewRef}
                  className="relative border border-slate-800 bg-slate-900 overflow-y-auto"
                  style={{ height: esignPreviewHeight }}
                  onMouseMove={esignMode === "prepare" ? onMoveBox : undefined}
                  onMouseUp={esignMode === "prepare" ? endDragBox : undefined}
                  onMouseLeave={esignMode === "prepare" ? endDragBox : undefined}
                >
                  <div ref={outerStableRef} className="mx-auto w-full max-w-[1100px]">
                  {esignDocFile?.type === "application/pdf" ? (
                  <EsignPdfErrorBoundary>
                  {/* react-pdf renders to canvas; we own the DOM so overlay clicks work. */}
                  <Document
                    file={esignDocFile}
                    onLoadSuccess={({ numPages }) => {
                      setEsignPageCount(numPages);
                      setEsignPdfError(null);
                      if (esignStep === "signers" && numPages > 0) setEsignStep("place");
                    }}
                    onLoadError={(err) => setEsignPdfError(err?.message ?? String(err))}
                    onSourceError={(err) => setEsignPdfError(err?.message ?? String(err))}
                  >
                    {(esignPageCount ?? 0) > 0 &&
                      Array.from({ length: Math.max(0, esignPageCount ?? 0) }, (_, pageIndex) => {
                        const dims = esignPageDimensions[pageIndex];
                        const baseW = dims?.width ?? 612;
                        const baseH = dims?.height ?? 792;
                        const renderW = baseW * effectiveScale;
                        const renderH = baseH * effectiveScale;
                        const inPlacementMode =
                          esignMode === "prepare" &&
                          !!esignFieldTool &&
                          !esignSentLocked;
                        return (
                        <div key={pageIndex} className="relative flex justify-center">
                          <div
                            ref={pageIndex === 0 ? pdfRenderRef : undefined}
                            className="relative"
                            style={{ width: renderW, height: renderH }}
                            onPointerDownCapture={(e) => {
                              const t = e.target as HTMLElement;
                              const isField = !!t.closest("[data-field-id]");
                              if (DEBUG_ESIGN) {
                                setEsignDebugEvents((prev) => [
                                  {
                                    type: "WRAPPER_CAPTURE",
                                    targetTag: t.tagName,
                                    targetClass: t.className?.slice?.(0, 60) ?? "",
                                    overlayRan: !isField,
                                    ts: Date.now(),
                                  },
                                  ...prev.slice(0, 19),
                                ]);
                              }
                              if (isField) return;
                              if (!inPlacementMode) return;
                              if (!esignFieldTool) {
                                setEsignPlacementHint("Pick a field tool first.");
                                window.setTimeout(() => setEsignPlacementHint(null), 1200);
                                return;
                              }
                              e.stopPropagation();
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              const xPct = (e.clientX - rect.left) / rect.width;
                              const yPct = (e.clientY - rect.top) / rect.height;
                              addEsignFieldAt(pageIndex, xPct, yPct);
                            }}
                          >
                            <Page
                              pageNumber={pageIndex + 1}
                              scale={effectiveScale}
                              renderTextLayer={false}
                              renderAnnotationLayer={false}
                              onLoadSuccess={(p) =>
                                setEsignPageDimensions((prev) => {
                                  // Keep unscaled base dimensions stable across zoom changes.
                                  const nextW = p.width / Math.max(effectiveScale, 0.0001);
                                  const nextH = p.height / Math.max(effectiveScale, 0.0001);
                                  const current = prev[pageIndex];
                                  if (
                                    current &&
                                    Math.abs(current.width - nextW) < 0.5 &&
                                    Math.abs(current.height - nextH) < 0.5
                                  ) {
                                    return prev;
                                  }
                                  return {
                                    ...prev,
                                    [pageIndex]: { width: nextW, height: nextH },
                                  };
                                })
                              }
                            />
                            <div
                              className={`absolute inset-0 z-10 pointer-events-none ${inPlacementMode ? "cursor-crosshair" : ""}`}
                            />
                            {esignFields
                              .filter((f) => f.pageIndex === pageIndex)
                              .map((box) => {
                                const dims = esignPageDimensions[pageIndex];
                                if (!dims) return null;
                                const recipientName =
                                  esignSigners.find((s) => (box.signerId ? s.id === box.signerId : s.email === box.recipientEmail))?.name ||
                                  "Recipient";
                                const typeLabel = box.type === "signature" ? "Signature" : box.type === "initials" ? "Initials" : box.type === "date" ? "Date" : "Printed Name";
                                const label = `${typeLabel} • ${recipientName}`;
                                const isFilled = Boolean(box.value && String(box.value).trim());
                                const isSelected = esignSelectedFieldId === box.id;
                                const isHighlighted = esignHighlightedFieldId === box.id;
                                const isEditing = esignEditingFieldId === box.id;
                                const isMe = box.recipientEmail === esignSigningAsEmail;
                                const inSignMode = esignMode === "sign";
                                const inPrepareMode = esignMode === "prepare";
                                const isTargeted = inSignMode && currentTargetFieldId === box.id;
                                const isRequiredIncompleteForMe =
                                  inSignMode && isMe && Boolean(box.required) && !isFieldComplete(box);
                                const isSelfOwned =
                                  (box.recipientEmail || "").toLowerCase() ===
                                  (esignSigningAsEmail || "").toLowerCase();
                                const ownerLabel = isSelfOwned ? "You" : recipientName;
                                const color = signerColorClass(box.recipientEmail || "");
                                return (
                                  <div
                                    key={box.id}
                                    data-field-id={box.id}
                                    data-esign-field-id={box.id}
                                    data-esign-target={isTargeted ? "true" : "false"}
                                    title={`${typeLabel}\nAssigned to: ${recipientName}`}
                                    className={`absolute z-[100] pointer-events-auto ${color.bg} ${color.text} text-xs select-none ${isFilled ? `border ${color.border}` : `border border-dashed ${color.dash}`} ${isSelected && inPrepareMode ? "ring-2 ring-emerald-400 shadow-lg shadow-emerald-500/20" : ""} ${isHighlighted ? "ring-1 ring-sky-400/50" : ""} ${isTargeted ? "border-sky-300 ring-2 ring-sky-300/60 shadow-sm shadow-sky-500/20" : ""} ${inSignMode && !box.required ? "opacity-60" : ""} ${inSignMode && !isMe ? "opacity-45 saturate-50 cursor-not-allowed" : ""}`}
                                    style={{
                                      left: `${box.xPct * 100}%`,
                                      top: `${box.yPct * 100}%`,
                                      width: `${box.wPct * 100}%`,
                                      height: `${box.hPct * 100}%`,
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (DEBUG_ESIGN) {
                                        setEsignDebugEvents((prev) => [
                                          { type: "FIELD_CLICK", targetTag: "field", targetClass: box.id, overlayRan: false, ts: Date.now() },
                                          ...prev.slice(0, 19),
                                        ]);
                                      }
                                      if (inSignMode && isMe) {
                                        setTargetField(box.id);
                                        if (box.type === "signature") {
                                          setEsignSignatureModal({ fieldId: box.id, type: "signature" });
                                        } else if (box.type === "initials") {
                                          setEsignSignatureModal({ fieldId: box.id, type: "initials" });
                                        } else if (box.type === "text") {
                                          setEsignEditingFieldId(box.id);
                                          setDraftValue(box.id, box.value ?? "");
                                        } else if (box.type === "date") {
                                          setEsignEditingFieldId(box.id);
                                          setDraftValue(box.id, box.value || new Date().toISOString().slice(0, 10));
                                        }
                                      } else if (inPrepareMode) {
                                        setEsignSelectedFieldId(box.id);
                                      }
                                    }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                      if (!inPrepareMode) return;
                                      const t = e.target as HTMLElement;
                                      if (!t.closest("button") && !t.closest("[data-resize]") && !t.closest("textarea") && !t.closest("input")) {
                                        setEsignSelectedFieldId(box.id);
                                        startDragBox(e, box.id, "move");
                                      }
                                    }}
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      if ((box.type === "text" || box.type === "date") && (inPrepareMode || (inSignMode && isMe))) {
                                        setEsignEditingFieldId(box.id);
                                        setDraftValue(
                                          box.id,
                                          box.value || (box.type === "date" ? new Date().toISOString().slice(0, 10) : "")
                                        );
                                      }
                                    }}
                                  >
                                    {/* Label */}
                                    <div className="px-1 py-0.5 truncate text-[10px] opacity-80 border-b border-emerald-400/30 flex items-center gap-1">
                                      <span className="truncate">{label}</span>
                                      <span className={`rounded px-1 py-0 text-[9px] ${color.badge}`}>
                                        {ownerLabel}
                                      </span>
                                    </div>
                                    {isTargeted && Boolean(box.required) && isMe && (
                                      <div className="absolute left-1 -top-5 rounded bg-sky-400/90 text-slate-950 px-1.5 py-0.5 text-[9px] font-semibold">
                                        Required field
                                      </div>
                                    )}
                                    {isTargeted && isRequiredIncompleteForMe && (
                                      <div className="absolute right-1 top-1 rounded bg-sky-400/90 text-slate-950 px-1 py-0.5 text-[9px] font-semibold">
                                        Please complete this field
                                      </div>
                                    )}
                                    {/* Delete button (Prepare mode, selected only) */}
                                    {inPrepareMode && isSelected && (
                                      <button
                                        type="button"
                                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 hover:bg-rose-400 text-white text-xs flex items-center justify-center z-10"
                                        onClick={(e) => { e.stopPropagation(); deleteSelectedField(); }}
                                        title="Delete field"
                                      >
                                        ×
                                      </button>
                                    )}
                                    {/* Content area - controlled by box.value, draft when editing; visible on PDF */}
                                    <div className="p-1 overflow-hidden flex-1 min-h-0 flex flex-col justify-center">
                                      {box.type === "text" && (
                                        (() => {
                                          if (DEBUG_ESIGN) console.log("RENDER_FIELD", { id: box.id, type: "text", value: box.value ?? "", draft: esignDraftById[box.id] ?? null });
                                          return isEditing ? (
                                            <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                                              <input
                                                type="text"
                                                className="w-full min-h-[2em] bg-white border border-emerald-500 text-[#111] text-xs p-1 rounded z-[110]"
                                                value={esignDraftById[box.id] ?? box.value ?? ""}
                                                onChange={(e) => setDraftValue(box.id, e.target.value)}
                                                onBlur={(e) => {
                                                  const v = (e.target as HTMLInputElement).value;
                                                  updateBoxValue(box.id, v, "text");
                                                  setEsignEditingFieldId(null);
                                                  setEsignDraftById((d) => { const n = { ...d }; delete n[box.id]; return n; });
                                                  setEsignSavedToast(true);
                                                  window.setTimeout(() => setEsignSavedToast(false), 1200);
                                                  if (inSignMode && isMe) scrollToNextEmptyField();
                                                }}
                                                onKeyDown={(e) => {
                                                  if (e.key === "Enter" && !e.shiftKey) {
                                                    e.preventDefault();
                                                    const v = (e.target as HTMLInputElement).value;
                                                    updateBoxValue(box.id, v, "text");
                                                    setEsignEditingFieldId(null);
                                                    setEsignDraftById((d) => { const n = { ...d }; delete n[box.id]; return n; });
                                                    setEsignSavedToast(true);
                                                    window.setTimeout(() => setEsignSavedToast(false), 1200);
                                                    if (inSignMode && isMe) scrollToNextEmptyField();
                                                  }
                                                  if (e.key === "Escape") {
                                                    setEsignEditingFieldId(null);
                                                    setEsignDraftById((d) => { const n = { ...d }; delete n[box.id]; return n; });
                                                  }
                                                }}
                                                autoFocus
                                              />
                                              <div className="flex gap-1">
                                                <button type="button" className="btn text-xs flex-1" onClick={() => { const v = esignDraftById[box.id] ?? box.value ?? ""; updateBoxValue(box.id, v, "text"); setEsignEditingFieldId(null); setEsignDraftById((d) => { const n = { ...d }; delete n[box.id]; return n; }); setEsignSavedToast(true); window.setTimeout(() => setEsignSavedToast(false), 1200); scrollToNextEmptyField(); }}>Save</button>
                                                <button type="button" className="btn text-xs flex-1 text-slate-400" onClick={() => { setEsignEditingFieldId(null); setEsignDraftById((d) => { const n = { ...d }; delete n[box.id]; return n; }); }}>Cancel</button>
                                              </div>
                                            </div>
                                          ) : (
                                            <div
                                              className="w-full min-h-[2em] bg-white/95 border border-slate-300 text-[#111] text-xs p-1 rounded truncate flex items-center cursor-pointer hover:border-emerald-400/50"
                                              onClick={(e) => { e.stopPropagation(); if (inPrepareMode || (inSignMode && isMe)) { setEsignEditingFieldId(box.id); setDraftValue(box.id, box.value ?? ""); } }}
                                            >
                                              {(box.value ?? "") || (box.placeholder || "Printed name")}
                                            </div>
                                          );
                                        })()
                                      )}
                                      {box.type === "date" && (
                                        (() => {
                                          if (DEBUG_ESIGN) console.log("RENDER_FIELD", { id: box.id, type: "date", value: box.value ?? "", draft: esignDraftById[box.id] ?? null });
                                          return isEditing ? (
                                            <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                                              <input
                                                type="date"
                                                className="w-full bg-white border border-emerald-500 text-[#111] text-xs p-1 rounded z-[110]"
                                                value={esignDraftById[box.id] ?? box.value ?? ""}
                                                onChange={(e) => setDraftValue(box.id, e.target.value)}
                                                onBlur={(e) => {
                                                  const v = (e.target as HTMLInputElement).value;
                                                  updateBoxValue(box.id, v, "date");
                                                  setEsignEditingFieldId(null);
                                                  setEsignDraftById((d) => { const n = { ...d }; delete n[box.id]; return n; });
                                                  setEsignSavedToast(true);
                                                  window.setTimeout(() => setEsignSavedToast(false), 1200);
                                                  if (inSignMode && isMe) scrollToNextEmptyField();
                                                }}
                                                onKeyDown={(e) => {
                                                  if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    const v = (e.target as HTMLInputElement).value;
                                                    updateBoxValue(box.id, v, "date");
                                                    setEsignEditingFieldId(null);
                                                    setEsignDraftById((d) => { const n = { ...d }; delete n[box.id]; return n; });
                                                    setEsignSavedToast(true);
                                                    window.setTimeout(() => setEsignSavedToast(false), 1200);
                                                    if (inSignMode && isMe) scrollToNextEmptyField();
                                                  }
                                                  if (e.key === "Escape") {
                                                    setEsignEditingFieldId(null);
                                                    setEsignDraftById((d) => { const n = { ...d }; delete n[box.id]; return n; });
                                                  }
                                                }}
                                                autoFocus
                                              />
                                              <div className="flex gap-1">
                                                <button type="button" className="btn text-xs flex-1" onClick={() => { const v = esignDraftById[box.id] ?? box.value ?? ""; updateBoxValue(box.id, v, "date"); setEsignEditingFieldId(null); setEsignDraftById((d) => { const n = { ...d }; delete n[box.id]; return n; }); setEsignSavedToast(true); window.setTimeout(() => setEsignSavedToast(false), 1200); scrollToNextEmptyField(); }}>Save</button>
                                                <button type="button" className="btn text-xs flex-1 text-slate-400" onClick={() => { setEsignEditingFieldId(null); setEsignDraftById((d) => { const n = { ...d }; delete n[box.id]; return n; }); }}>Cancel</button>
                                              </div>
                                            </div>
                                          ) : (
                                            <div
                                              className="w-full min-h-[2em] bg-white/95 border border-slate-300 text-[#111] text-xs p-1 rounded flex items-center cursor-pointer hover:border-emerald-400/50"
                                              onClick={(e) => { e.stopPropagation(); if (inPrepareMode || (inSignMode && isMe)) { setEsignEditingFieldId(box.id); setDraftValue(box.id, box.value || new Date().toISOString().slice(0, 10)); } }}
                                            >
                                              {(box.value ?? "") || box.placeholder || "Date"}
                                            </div>
                                          );
                                        })()
                                      )}
                                      {box.type === "signature" && (
                                        isFilled ? (
                                          (box.value || "").startsWith("data:image") ? (
                                            <img src={box.value} alt="" className="max-h-full max-w-full object-contain" />
                                          ) : (
                                            <div className="text-[#111] font-serif italic truncate text-sm" style={{ fontFamily: "Georgia, 'Brush Script MT', cursive" }}>{String(box.value)}</div>
                                          )
                                        ) : inSignMode && !isMe ? (
                                          <div className="text-emerald-200/50 text-[10px]">Assigned to {recipientName}</div>
                                        ) : (
                                          <div className="w-full h-full rounded border border-dashed border-slate-500/50 text-slate-300/80 text-[11px] cursor-pointer flex items-center justify-center">
                                            Signature
                                          </div>
                                        )
                                      )}
                                      {box.type === "initials" && (
                                        isFilled ? (
                                          (box.value || "").startsWith("data:image") ? (
                                            <img src={box.value} alt="" className="max-h-full max-w-full object-contain" />
                                          ) : (
                                            <div className="text-[#111] font-serif italic truncate text-sm" style={{ fontFamily: "Georgia, 'Brush Script MT', cursive" }}>{String(box.value)}</div>
                                          )
                                        ) : inSignMode && !isMe ? (
                                          <div className="text-emerald-200/50 text-[10px]">Assigned to {recipientName}</div>
                                        ) : (
                                          <div className="w-full h-full rounded border border-dashed border-slate-500/50 text-slate-300/80 text-[11px] cursor-pointer flex items-center justify-center">
                                            Initials
                                          </div>
                                        )
                                      )}
                                    </div>
                                    {/* Resize handles (Prepare mode only) */}
                                    {inPrepareMode && (
                                      <>
                                        <div data-resize className="absolute right-0 bottom-0 w-2 h-2 bg-emerald-400 cursor-se-resize" onMouseDown={(e) => { e.stopPropagation(); startDragBox(e, box.id, "resize-se"); }} />
                                        <div data-resize className="absolute left-0 bottom-0 w-2 h-2 bg-emerald-400 cursor-sw-resize" onMouseDown={(e) => { e.stopPropagation(); startDragBox(e, box.id, "resize-sw"); }} />
                                        <div data-resize className="absolute right-0 top-0 w-2 h-2 bg-emerald-400 cursor-ne-resize" onMouseDown={(e) => { e.stopPropagation(); startDragBox(e, box.id, "resize-ne"); }} />
                                        <div data-resize className="absolute left-0 top-0 w-2 h-2 bg-emerald-400 cursor-nw-resize" onMouseDown={(e) => { e.stopPropagation(); startDragBox(e, box.id, "resize-nw"); }} />
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      );
                      })}
                  </Document>
                  </EsignPdfErrorBoundary>
                  ) : (
                  <img
                    src={esignPreviewUrl || ""}
                    alt="Preview"
                    className="max-h-full max-w-full object-contain"
                  />
                  )}
                  {esignPdfError && (
                    <div className="text-xs text-rose-300 mt-2">PDF error: {esignPdfError}</div>
                  )}
                  </div>
                </div>
                <div className="hidden lg:flex flex-col rounded border border-slate-700 bg-slate-900/60 p-2 text-xs h-fit min-h-[420px]">
                  {esignMode === "prepare" && (
                    <div data-testid="sender-identity" className="mb-2 rounded border border-slate-700 p-2 space-y-2">
                      <div className="text-[11px] text-slate-400">🧑 Your Signing Identity</div>
                      <label className="block text-[11px] text-slate-400">
                        Full Name
                        <input
                          className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-slate-200"
                          value={esignSigners[0]?.name || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEsignSigners((prev) => {
                              const first = prev[0] || { id: `signer_${Date.now()}`, name: "", email: "", role: "host", status: "Not Sent" as const };
                              return [{ ...first, name: val, role: "host" }, ...prev.slice(1)];
                            });
                            setEsignSignatureValue(val);
                            setEsignInitialsValue(deriveInitials(val));
                          }}
                          placeholder="Your full name"
                        />
                      </label>
                      <label className="block text-[11px] text-slate-400">
                        Email
                        <input
                          className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-slate-200"
                          value={esignSigners[0]?.email || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEsignSigners((prev) => {
                              const first = prev[0] || { id: `signer_${Date.now()}`, name: "", email: "", role: "host", status: "Not Sent" as const };
                              return [{ ...first, email: val, role: "host" }, ...prev.slice(1)];
                            });
                            if (!esignSigningAsEmail) setEsignSigningAsEmail(val);
                          }}
                          placeholder="you@email.com"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-1 text-[11px]">
                        <div className="rounded border border-slate-700 px-2 py-1">
                          <div className="text-slate-400">Signature</div>
                          <div className="text-slate-200 truncate">{adoptedSignaturePreview || "Not set"}</div>
                        </div>
                        <div className="rounded border border-slate-700 px-2 py-1">
                          <div className="text-slate-400">Initials</div>
                          <div className="text-slate-200 truncate">{adoptedInitialsPreview || "Not set"}</div>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button data-testid="adopt-signature" className="btn text-xs flex-1" onClick={() => setEsignSignatureModal({ type: "signature" })}>Adopt signature</button>
                        <button data-testid="adopt-initials" className="btn text-xs flex-1" onClick={() => setEsignSignatureModal({ type: "initials" })}>Adopt initials</button>
                      </div>
                      <label className="flex items-center gap-2 text-[11px] text-slate-300">
                        <input
                          type="checkbox"
                          checked={autoPlaceInitialsEveryPage}
                          onChange={(e) => setAutoPlaceInitialsEveryPage(e.target.checked)}
                        />
                        Auto-place initials on every page
                      </label>
                    </div>
                  )}
                  {esignMode === "prepare" && (
                  <div className="grid grid-cols-2 gap-1 mb-2">
                    <button className={`btn text-xs ${esignSideTab === "recipients" ? "ring-2 ring-emerald-400" : ""}`} onClick={() => setEsignSideTab("recipients")}>Recipients</button>
                    <button className={`btn text-xs ${esignSideTab === "fields" ? "ring-2 ring-emerald-400" : ""}`} onClick={() => setEsignSideTab("fields")}>Fields</button>
                  </div>
                  )}
                  {esignMode === "prepare" && esignSideTab === "recipients" && (
                    <div className="space-y-2">
                      <button
                        type="button"
                        className={`btn w-full text-xs ${canProceedReview ? "bg-emerald-600 hover:bg-emerald-500" : ""}`}
                        onClick={() => { setEsignStep("place"); setEsignSideTab("fields"); }}
                      >
                        Next: Place Fields
                      </button>
                      <div className="text-[11px] font-semibold tracking-wide text-slate-300">SIGNERS</div>
                      {esignSigners.map((s, idx) => (
                        <div
                          key={s.id}
                          className={`rounded border p-2 space-y-1 cursor-pointer ${activeSignerId === s.id ? "border-emerald-400 bg-emerald-900/15" : "border-slate-700"}`}
                          onClick={() => setActiveSignerId(s.id)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-slate-200 text-xs">{activeSignerId === s.id ? "✔" : "◻"} {idx === 0 ? "You (Host)" : (s.name?.trim() || `Signer ${idx + 1}`)}</span>
                            {idx > 0 && (
                              <button className="btn text-xs" onClick={(e) => { e.stopPropagation(); addEsignActivity(`Removed signer ${s.email || s.name || idx + 1}`); setEsignSigners(esignSigners.filter((_, i) => i !== idx)); setActiveSignerId((prev) => (prev === s.id ? (esignSigners[0]?.id || "") : prev)); }}>
                                Remove
                              </button>
                            )}
                          </div>
                          <input className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1" value={s.name} onChange={(e) => { const n = [...esignSigners]; n[idx] = { ...n[idx], name: e.target.value }; setEsignSigners(n); if (idx === 0) { setEsignSignatureValue(e.target.value); setEsignInitialsValue(deriveInitials(e.target.value)); } }} placeholder={idx === 0 ? "Your full name" : "Signer full name"} />
                          <input type="email" className={`w-full rounded bg-slate-900 border px-2 py-1 ${getEmailError(s.email) ? "border-rose-500/70" : "border-slate-700"}`} value={s.email} onChange={(e) => { const n = [...esignSigners]; n[idx] = { ...n[idx], email: e.target.value }; setEsignSigners(n); if (idx === 0 && !esignSigningAsEmail) setEsignSigningAsEmail(e.target.value); }} placeholder={idx === 0 ? "your@email.com" : "signer@email.com"} />
                          {getEmailError(s.email) && (
                            <div className="text-[10px] text-rose-300">{getEmailError(s.email)}</div>
                          )}
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-400">{recipientStatusByEmail[s.email] || "Not Sent"}</span>
                          </div>
                        </div>
                      ))}
                      <button className="btn w-full text-xs" onClick={() => { setEsignSigners([...esignSigners, { id: `signer_${Date.now()}`, name: "", email: "", role: "signer", status: "Not Sent" }]); addEsignActivity("Added signer"); }}>
                        + Add signer
                      </button>
                    </div>
                  )}
                  {esignMode === "prepare" && esignSideTab === "fields" && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-1">
                        {(["signature", "initials", "date", "text"] as const).map((t) => (
                          <button key={t} className={`btn text-xs ${esignFieldTool === t ? "ring-2 ring-emerald-400" : ""}`} onClick={() => setEsignFieldTool(t)}>
                            {t === "signature" ? "Signature" : t === "initials" ? "Initials" : t === "date" ? "Date" : "Printed Name"}
                          </button>
                        ))}
                      </div>
                      <div className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-300">
                        Fields for{" "}
                        <span className="font-medium text-slate-100">
                          {activeSigner?.name?.trim() ||
                            activeSigner?.email ||
                            "selected signer"}
                        </span>
                      </div>
                      {((selectedField && selectedField.type === "initials") || esignFieldTool === "initials") && (
                        <div className="rounded border border-slate-700 p-2">
                          <label className="flex items-center gap-2 text-slate-300">
                            <input
                              data-testid="repeat-initials-toggle"
                              type="checkbox"
                              disabled={esignPageCount <= 1 || !(selectedField && selectedField.type === "initials")}
                              checked={Boolean(selectedField?.type === "initials" && selectedField.repeatGroupId)}
                              onChange={(e) => {
                                if (!(selectedField && selectedField.type === "initials")) return;
                                toggleRepeatInitialsForField(selectedField.id, e.target.checked);
                              }}
                            />
                            Repeat initials on all pages
                          </label>
                          {esignPageCount <= 1 && (
                            <div className="text-[10px] text-slate-500 mt-1">Available when document has multiple pages.</div>
                          )}
                          <button
                            type="button"
                            className="btn text-xs mt-2 w-full"
                            onClick={placeInitialsAtAllSignatureBlocks}
                          >
                            Place initials at all signature blocks
                          </button>
                        </div>
                      )}
                      <label className="flex items-center gap-2 text-slate-300 text-[11px] rounded border border-slate-700 px-2 py-1">
                        <input
                          type="checkbox"
                          checked={allowNoRecipientFieldsRequired}
                          onChange={(e) => setAllowNoRecipientFieldsRequired(e.target.checked)}
                        />
                        No recipient fields required
                      </label>
                      <div className="space-y-1">
                        {esignSigners.map((s) => {
                          const byRecipient = allFieldsSorted.filter((f) => fieldBelongsToSigner(f, s));
                          const required = byRecipient.filter((f) => Boolean(f.required));
                          const complete = required.filter((f) => isFieldComplete(f));
                          return (
                            <div key={`grp-${s.email}`} className="flex items-center justify-between rounded border border-slate-700 px-2 py-1 text-[11px]">
                              <span className="text-slate-300 truncate">{s.name || s.email}</span>
                              <span className="text-slate-400">{complete.length}/{required.length} required complete</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="max-h-80 overflow-auto space-y-1">
                        {allFieldsSorted.filter((f) => (activeSigner ? fieldBelongsToSigner(f, activeSigner) : false)).map((f, idx) => (
                          <button key={f.id} className={`w-full text-left rounded border px-2 py-1 ${esignSelectedFieldId === f.id ? "border-emerald-400 bg-emerald-900/20" : "border-slate-700 hover:border-slate-500"}`} onClick={() => { setEsignSelectedFieldId(f.id); setTargetField(f.id); }}>
                            <div className="flex items-center justify-between">
                              <span>{idx + 1}. {(f.type === "text" ? "PRINTED NAME" : f.type.toUpperCase())} p{f.pageIndex + 1}</span>
                              <span className={isFieldComplete(f) ? "text-emerald-300" : "text-slate-400"}>{isFieldComplete(f) ? "Filled" : "Empty"}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                      {selectedField && (
                        <div className="rounded border border-slate-700 p-2 space-y-2">
                          <div className="text-slate-300 text-[11px] font-medium">Selected field</div>
                          <select
                            className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1"
                            value={selectedField.recipientEmail}
                            onChange={(e) => updateField(selectedField.id, { recipientEmail: e.target.value })}
                          >
                            {esignSigners.map((s) => <option key={s.email} value={s.email}>{s.name || s.email}</option>)}
                          </select>
                          <label className="flex items-center gap-2 text-slate-300">
                            <input
                              type="checkbox"
                              checked={Boolean(selectedField.required)}
                              onChange={(e) => updateField(selectedField.id, { required: e.target.checked })}
                            />
                            Required
                          </label>
                        </div>
                      )}
                    </div>
                  )}
                  {esignMode === "sign" && (
                    <div className="mt-2 border-t border-slate-700 pt-2">
                      <button
                        type="button"
                        className="w-full flex items-center justify-between rounded border border-slate-700 px-2 py-1 text-left hover:border-slate-500"
                        onClick={() => setShowSignRequiredPanel((v) => !v)}
                      >
                        <span className="text-slate-200 font-medium">
                          Fields remaining ({signerIncompleteRequiredFieldsSorted.length}/{signerRequiredFieldsSorted.length})
                        </span>
                        <span className="text-slate-400">{showSignRequiredPanel ? "Hide" : "Show"}</span>
                      </button>
                      <button
                        type="button"
                        className="mt-2 w-full rounded bg-emerald-600 px-2 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                        onClick={() => goToAdjacentRequiredField("next")}
                      >
                        Next Required
                      </button>
                      {showSignRequiredPanel && (
                        <div className="mt-2 max-h-60 overflow-auto space-y-1">
                          {signerRequiredFieldsSorted.map((f, idx) => {
                            const complete = isFieldComplete(f);
                            const active = currentTargetFieldId === f.id;
                            return (
                              <button
                                key={f.id}
                                type="button"
                                className={`w-full text-left rounded border px-2 py-1 ${active ? "border-cyan-400 bg-cyan-900/20 text-cyan-100" : "border-slate-700 hover:border-slate-500 text-slate-300"}`}
                                onClick={() => setTargetField(f.id)}
                              >
                                <div className="flex items-center justify-between">
                                  <span>{idx + 1}. {(f.type === "text" ? "PRINTED NAME" : f.type.toUpperCase())} p{f.pageIndex + 1}</span>
                                  <span className={complete ? "text-emerald-300" : "text-amber-300"}>{complete ? "Done" : "Required"}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                </div>
              </div>
            )}
            {esignMode !== "sign" && (
            <div className="rounded border border-slate-800 bg-slate-900/40">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-xs text-slate-300 hover:text-slate-100"
                onClick={() => setShowAuditTrail((v) => !v)}
              >
                <span>Audit Trail</span>
                <span className="text-slate-500">{showAuditTrail ? "Hide" : "Show"}</span>
              </button>
              {showAuditTrail && (
                <div className="max-h-36 overflow-auto border-t border-slate-800 px-3 py-2 text-[11px]">
                  {esignActivity.length > 0 ? esignActivity.map((ev, idx) => (
                    <div key={`${ev.ts}-${idx}`} className="text-slate-300">
                      {new Date(ev.ts).toLocaleTimeString()} - {ev.message}
                    </div>
                  )) : (
                    <div className="text-slate-500">No activity yet.</div>
                  )}
                </div>
              )}
            </div>
            )}
            {mobileSidePanelOpen && (
              <div className="fixed inset-0 z-[180] bg-black/60 lg:hidden" onClick={() => setMobileSidePanelOpen(false)}>
                <div className="absolute right-0 top-0 h-full w-[88vw] max-w-sm bg-slate-900 border-l border-slate-700 p-3 overflow-auto" onClick={(e) => e.stopPropagation()}>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-200">Document panel</div>
                    <button className="btn text-xs" onClick={() => setMobileSidePanelOpen(false)}>Close</button>
                  </div>
                  <div className="grid grid-cols-2 gap-1 mb-2">
                    <button className={`btn text-xs ${esignSideTab === "recipients" ? "ring-2 ring-emerald-400" : ""}`} onClick={() => setEsignSideTab("recipients")}>Recipients</button>
                    <button className={`btn text-xs ${esignSideTab === "fields" ? "ring-2 ring-emerald-400" : ""}`} onClick={() => setEsignSideTab("fields")}>Fields</button>
                  </div>
                  <div className="text-xs text-slate-400">Use desktop view for full panel editing controls.</div>
                </div>
              </div>
            )}
            {showSendModal && (
              <div className="fixed inset-0 z-[205] flex items-center justify-center bg-black/60" onClick={() => setShowSendModal(false)}>
                <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 max-w-xl w-full mx-2" onClick={(e) => e.stopPropagation()}>
                  <div className="text-lg font-semibold text-slate-100 mb-1">Send document</div>
                  <div className="text-xs text-slate-400 mb-3">Invite recipients now, before signing yourself.</div>
                  <div className="mb-3 flex flex-wrap gap-1">
                    {esignSigners.map((s) => (
                      <span key={s.email} className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300">
                        {s.name || s.email}
                      </span>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <input className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-2 text-sm" value={sendSubject} onChange={(e) => setSendSubject(e.target.value)} placeholder="Subject" />
                    <textarea className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-2 text-sm min-h-[90px]" value={sendMessage} onChange={(e) => setSendMessage(e.target.value)} placeholder="Message" />
                    <label className="text-xs text-slate-300 flex items-center gap-2">
                      <input type="checkbox" checked readOnly />
                      Create invite links
                    </label>
                    <label className="text-xs text-slate-500 flex items-center gap-2">
                      <input type="checkbox" disabled />
                      Email delivery (coming soon)
                    </label>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button className="btn flex-1 text-slate-300" onClick={() => setShowSendModal(false)}>Cancel</button>
                    <button className="btn flex-1 bg-emerald-600 hover:bg-emerald-500" onClick={sendEsignInvitesFromModal}>Send</button>
                  </div>
                </div>
              </div>
            )}
            {showIdentityModal && (
              <div className="fixed inset-0 z-[202] flex items-center justify-center bg-black/60" onClick={() => setShowIdentityModal(false)}>
                <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 max-w-md w-full mx-2" onClick={(e) => e.stopPropagation()}>
                  <div className="font-semibold text-slate-100 mb-3">Your Signing Identity</div>
                  <div className="space-y-2">
                    <label className="text-xs text-slate-300 block">
                      Full Name
                      <input
                        className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-2 text-sm"
                        value={esignSigners[0]?.name || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEsignSigners((prev) => {
                            const first = prev[0] || { id: `signer_${Date.now()}`, name: "", email: "", role: "host", status: "Not Sent" as const };
                            return [{ ...first, name: val, role: "host" }, ...prev.slice(1)];
                          });
                          setEsignSignatureValue(val);
                          setEsignInitialsValue(deriveInitials(val));
                        }}
                      />
                    </label>
                    <label className="text-xs text-slate-300 block">
                      Email
                      <input
                        className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-2 text-sm"
                        value={esignSigners[0]?.email || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEsignSigners((prev) => {
                            const first = prev[0] || { id: `signer_${Date.now()}`, name: "", email: "", role: "host", status: "Not Sent" as const };
                            return [{ ...first, email: val, role: "host" }, ...prev.slice(1)];
                          });
                          if (!esignSigningAsEmail) setEsignSigningAsEmail(val);
                        }}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded border border-slate-700 px-2 py-1">
                        <div className="text-slate-400">Signature Preview</div>
                        <div className="truncate text-slate-100">{adoptedSignaturePreview || "Not set"}</div>
                      </div>
                      <div className="rounded border border-slate-700 px-2 py-1">
                        <div className="text-slate-400">Initials Preview</div>
                        <div className="truncate text-slate-100">{adoptedInitialsPreview || "Not set"}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="btn flex-1 text-xs" onClick={() => { setShowIdentityModal(false); setEsignSignatureModal({ type: "signature" }); }}>
                        Edit Signature
                      </button>
                      <button type="button" className="btn flex-1 text-xs" onClick={() => { setShowIdentityModal(false); setEsignSignatureModal({ type: "initials" }); }}>
                        Edit Initials
                      </button>
                    </div>
                    <label className="text-xs text-slate-300 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={autoPlaceInitialsEveryPage}
                        onChange={(e) => setAutoPlaceInitialsEveryPage(e.target.checked)}
                      />
                      Auto-place initials on every page
                    </label>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button type="button" className="btn text-xs" onClick={() => setShowIdentityModal(false)}>Done</button>
                  </div>
                </div>
              </div>
            )}
            {/* Signature/Initials modal when user lacks value */}
            {esignSignatureModal && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60" onClick={() => setEsignSignatureModal(null)}>
                <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 max-w-md w-full mx-2" onClick={(e) => e.stopPropagation()}>
                  {(() => {
                    const modalField = esignSignatureModal.fieldId
                      ? esignFields.find((f) => f.id === esignSignatureModal.fieldId)
                      : null;
                    const fieldValue = (modalField?.value || "").trim();
                    const isImageValue = fieldValue.startsWith("data:image/");
                    return (
                      <>
                  <div className="font-semibold text-slate-200 mb-2">
                    {esignSignatureModal.fieldId
                      ? (esignSignatureModal.type === "signature" ? "Edit signature" : "Edit initials")
                      : (esignSignatureModal.type === "signature" ? "Set your signature" : "Set your initials")}
                  </div>
                  <div className="mb-2 grid grid-cols-3 gap-1">
                    <button className={`btn text-xs ${esignSignatureType === "typed" ? "ring-2 ring-emerald-400" : ""}`} onClick={() => setEsignSignatureType("typed")}>Type</button>
                    <button className={`btn text-xs ${esignSignatureType === "drawn" ? "ring-2 ring-emerald-400" : ""}`} onClick={() => setEsignSignatureType("drawn")}>Draw</button>
                    <button className={`btn text-xs ${esignSignatureType === "image" ? "ring-2 ring-emerald-400" : ""}`} onClick={() => setEsignSignatureType("image")}>Upload</button>
                  </div>
                  {isImageValue && (
                    <div className="mb-2 rounded border border-slate-700 bg-slate-800/60 p-2">
                      <img src={fieldValue} alt="" className="max-h-24 object-contain mx-auto" />
                    </div>
                  )}
                  {esignSignatureModal.type === "signature" && esignSignatureType === "typed" ? (
                    <input
                      className="rounded bg-slate-800 border border-slate-700 px-2 py-2 w-full text-emerald-100 mb-3"
                      value={esignSignatureValue}
                      onChange={(e) => setEsignSignatureValue(e.target.value)}
                      placeholder="Type your signature"
                      autoFocus
                    />
                  ) : esignSignatureModal.type === "signature" && esignSignatureType === "drawn" ? (
                    <div className="rounded border border-slate-700 bg-slate-800/50 px-2 py-3 text-xs text-slate-400 mb-3">
                      Draw mode is available in Prepare defaults. Use Typed for fastest signing.
                    </div>
                  ) : esignSignatureModal.type === "signature" && esignSignatureType === "image" ? (
                    <div className="rounded border border-slate-700 bg-slate-800/50 px-2 py-3 text-xs text-slate-400 mb-3">
                      Upload mode is available in Prepare defaults. Use Typed for fastest signing.
                    </div>
                  ) : esignSignatureType === "typed" ? (
                    <input
                      className="rounded bg-slate-800 border border-slate-700 px-2 py-2 w-full text-emerald-100 mb-3"
                      value={esignInitialsValue}
                      onChange={(e) => setEsignInitialsValue(e.target.value)}
                      placeholder="Initials"
                      autoFocus
                    />
                  ) : (
                    <div className="rounded border border-slate-700 bg-slate-800/50 px-2 py-3 text-xs text-slate-400 mb-3">
                      {esignSignatureType === "drawn"
                        ? "Draw mode is available for signature and will be added for initials."
                        : "Upload mode is available for signature and will be added for initials."}
                    </div>
                  )}
                  {esignSignatureModal.type === "signature" && (
                    <label className="text-xs text-slate-300 flex items-center gap-2 mb-3">
                      <input
                        type="checkbox"
                        checked={esignSaveSignature}
                        onChange={(e) => setEsignSaveSignature(e.target.checked)}
                      />
                      Save for this recipient
                    </label>
                  )}
                  {esignSignatureModal.type === "initials" && (
                    <label className="text-xs text-slate-300 flex items-center gap-2 mb-3">
                      <input
                        type="checkbox"
                        checked={esignSaveInitials}
                        onChange={(e) => setEsignSaveInitials(e.target.checked)}
                      />
                      Save initials for this recipient
                    </label>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn flex-1 bg-emerald-600 hover:bg-emerald-500"
                      onClick={() => {
                        const raw = (esignSignatureModal.type === "signature" ? esignSignatureValue : esignInitialsValue)?.trim();
                        const val =
                          esignSignatureModal.type === "initials"
                            ? raw.toUpperCase()
                            : raw;
                        if (val) {
                          if (esignSignatureModal.type === "signature") setEsignSignatureValue(val);
                          else setEsignInitialsValue(val);
                          if (esignSignatureModal.fieldId) {
                            updateBoxValue(esignSignatureModal.fieldId, val, esignSignatureModal.type);
                            scrollToNextEmptyField();
                          }
                          setEsignSignatureModal(null);
                        }
                      }}
                    >
                      {esignSignatureModal.fieldId ? "Apply & Continue" : "Apply & Continue"}
                    </button>
                    {esignSignatureModal.fieldId && (
                      <button
                        type="button"
                        className="btn flex-1 text-rose-300"
                        onClick={() => {
                          updateBoxValue(esignSignatureModal.fieldId!, "", esignSignatureModal.type);
                          setEsignSignatureModal(null);
                        }}
                      >
                        Clear
                      </button>
                    )}
                    <button type="button" className="btn flex-1 text-slate-400" onClick={() => setEsignSignatureModal(null)}>Cancel</button>
                  </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
            {showSignCompleteModal && (
              <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60" onClick={() => setShowSignCompleteModal(false)}>
                <div data-testid="signed-modal" className="bg-slate-900 border border-slate-700 rounded-lg p-5 max-w-md w-full mx-2 text-center" onClick={(e) => e.stopPropagation()}>
                  <div className="text-4xl leading-none mb-2" aria-hidden="true">✅</div>
                  <div className="font-semibold text-emerald-300 text-lg mb-1">Document Signed</div>
                  <div className="text-xs text-slate-400 mb-4">
                    All required fields have been completed.
                  </div>
                  <div className="text-xs text-slate-500 mb-4">
                    This confirms signer completion in the current session.
                  </div>
                  <div className="flex gap-2">
                    <button
                      data-testid="download-signed-pdf"
                      type="button"
                      className="btn flex-1 bg-emerald-600 hover:bg-emerald-500"
                      onClick={handleExportFilledPdf}
                      disabled={esignExporting}
                    >
                      {esignExporting ? "Exporting…" : "Download Signed PDF"}
                    </button>
                    <button type="button" className="btn flex-1 text-slate-300" onClick={() => setShowSignCompleteModal(false)}>
                      Done
                    </button>
                  </div>
                </div>
              </div>
            )}
            {/* Saved toast */}
            {esignSavedToast && (
              <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] bg-emerald-600 text-white px-4 py-2 rounded shadow-lg text-sm animate-pulse">
                Saved
              </div>
            )}
            {/* Dev-only: E-Sign debug panel - disabled to verify build */}
            {DEBUG_ESIGN && phase === "esign" && esignMode !== "sign" && (
              <div className="fixed bottom-4 left-4 z-[150] max-h-48 overflow-auto rounded border border-slate-600 bg-slate-900/95 px-3 py-2 text-xs font-mono text-slate-300 shadow-lg min-w-[220px]">
                <div className="font-semibold text-emerald-400 mb-1">E-Sign Debug</div>
                <div className="space-y-0.5 text-slate-400 mb-2">
                  <div>mode={esignMode} step={esignStep}</div>
                  <div>placementMode={String(!!(esignMode === "prepare" && esignStep === "place" && esignFieldTool))} tool={String(esignFieldTool)}</div>
                  <div>pageCount={esignPageCount ?? 0} dims={Object.keys(esignPageDimensions).length}</div>
                </div>
                <div className="border-t border-slate-700 pt-1 text-slate-400">Last pointer events:</div>
                <div className="space-y-0.5 mt-0.5">
                  {esignDebugEvents.length === 0 ? (
                    <span className="text-slate-500">None yet</span>
                  ) : (
                    esignDebugEvents.map((ev, i) => (
                      <div key={`${ev.ts}-${i}`} className="text-slate-300 truncate" title={`${ev.targetTag} ${ev.targetClass}`}>
                        {ev.type} {ev.targetTag} {ev.overlayRan ? "✓" : "-"}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {showLegacyEsignStacks && esignStep !== "upload" && esignMode !== "sign" && (
            <div className="rounded-md border border-slate-800 p-3 space-y-3">
              <div className="font-semibold text-slate-200">1) Recipients</div>
              {esignSigners.map((s, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input className="rounded bg-slate-900 border border-slate-800 px-2 py-1" value={s.name} onChange={(e) => { const n = [...esignSigners]; n[idx] = { ...n[idx], name: e.target.value }; setEsignSigners(n); }} placeholder="name" />
                  <input className="rounded bg-slate-900 border border-slate-800 px-2 py-1" value={s.email} onChange={(e) => { const n = [...esignSigners]; n[idx] = { ...n[idx], email: e.target.value }; setEsignSigners(n); }} placeholder="email" />
                  <input className="rounded bg-slate-900 border border-slate-800 px-2 py-1" value={s.role} onChange={(e) => { const n = [...esignSigners]; n[idx] = { ...n[idx], role: e.target.value || "signer" }; setEsignSigners(n); }} placeholder="role" />
                  <button className="btn" onClick={() => setEsignSigners(esignSigners.filter((_, i) => i !== idx))}>Remove</button>
                </div>
              ))}
              <button className="btn" onClick={() => setEsignSigners([...esignSigners, { id: `signer_${Date.now()}`, name: "", email: "", role: "signer", status: "Not Sent" }])}>Add recipient</button>
              <button className="btn" onClick={createEsignPacket} disabled={!esignDocFile}>Create Packet</button>
            </div>
          )}

          {showLegacyEsignStacks && esignStep !== "upload" && esignMode !== "sign" && (
            <div ref={esignSignatureInputsRef} className="rounded-md border border-slate-800 p-3 space-y-3">
              <details className="text-sm">
                <summary className="font-semibold text-slate-200 cursor-pointer">Signature / Initials defaults (Prepare)</summary>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <button
                  className="btn"
                  onClick={() => setEsignSignatureType("typed")}
                >
                  Typed
                </button>
                <button
                  className="btn"
                  onClick={() => setEsignSignatureType("drawn")}
                >
                  Drawn
                </button>
                <button
                  className="btn"
                  onClick={() => setEsignSignatureType("image")}
                >
                  Upload image
                </button>
              </div>
              {esignSignatureType === "typed" && (
                <input
                  className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
                  value={esignSignatureValue}
                  onChange={(e) => setEsignSignatureValue(e.target.value)}
                  placeholder="Type your signature"
                />
              )}
              {esignSignatureType === "drawn" && (
                <canvas
                  className="border border-slate-800 bg-slate-900/40"
                  width={360}
                  height={120}
                  onPointerDown={(e) => {
                    const canvas = e.currentTarget;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) return;
                    ctx.strokeStyle = "#9ae6b4";
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
                    const move = (ev: PointerEvent) => {
                      ctx.lineTo(ev.offsetX, ev.offsetY);
                      ctx.stroke();
                    };
                    const up = () => {
                      canvas.removeEventListener("pointermove", move);
                      canvas.removeEventListener("pointerup", up);
                      setEsignSignatureValue(canvas.toDataURL("image/png"));
                    };
                    canvas.addEventListener("pointermove", move);
                    canvas.addEventListener("pointerup", up);
                  }}
                />
              )}
              {esignSignatureType === "image" && (
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="text-xs"
                  onChange={(e) => {
                    const file = e.target.files?.item(0);
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === "string") {
                        setEsignSignatureValue(reader.result);
                      }
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              )}
              <div className="text-xs text-slate-400">
                {esignSignatureValue
                  ? "Signature saved for this session."
                  : "Add a signature to stamp fields."}
              </div>
              <label className="text-xs text-slate-300 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={esignSaveSignature}
                  onChange={(e) => setEsignSaveSignature(e.target.checked)}
                />
                Save signature for next time
              </label>
              <input
                className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
                value={esignInitialsValue}
                onChange={(e) => setEsignInitialsValue(e.target.value)}
                placeholder="Initials"
              />
              <label className="text-xs text-slate-300 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={esignSaveInitials}
                  onChange={(e) => setEsignSaveInitials(e.target.checked)}
                />
                Save initials for next time
              </label>
              </details>
            </div>
          )}

          {showLegacyEsignStacks && esignStep === "place" && esignMode !== "sign" && (
            <div className="rounded-md border border-slate-800 p-3 space-y-3">
              <div className="font-semibold text-slate-200">Step 3 — Place Fields</div>
              <div className="text-xs text-slate-400">
                Visual guidance only.
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn"
                  onClick={() => setEsignFieldTool((v) => (v ? null : "signature"))}
                >
                  {esignFieldTool ? "Stop placing" : "Place fields"}
                </button>
                <div className="text-xs text-slate-400 self-center">
                  Click page to place.
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn"
                  onClick={() => setEsignStep("invite")}
                  disabled={esignFields.length === 0}
                >
                  Continue to invites
                </button>
                <button
                  className="btn"
                  onClick={() => { if (DEBUG_ESIGN) console.log("REPLACE_BOXES", "clear_fields", 0); setEsignFields([]); }}
                  disabled={esignFields.length === 0}
                >
                  Clear fields
                </button>
              </div>
              {esignFields.map((box) => (
                <div key={box.id} className="text-xs text-slate-300">
                  <span className="mr-2">Assigned to:</span>
                  <select
                    className="rounded bg-slate-900 border border-slate-800 px-2 py-1 text-xs"
                    value={box.recipientEmail}
                    onChange={(e) => {
                      const email = e.target.value;
                      setEsignFields((prev) =>
                        prev.map((b) =>
                          b.id === box.id ? { ...b, recipientEmail: email } : b
                        )
                      );
                    }}
                  >
                    <option value="">Select signer</option>
                    {esignSigners.map((s) => (
                      <option key={s.email} value={s.email}>
                        {s.name || s.email}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              {selectedField && (
                <div className="rounded border border-slate-800 p-2 text-xs space-y-2">
                  <div className="font-semibold text-slate-200">Field settings</div>
                  <select
                    className="rounded bg-slate-900 border border-slate-800 px-2 py-1 text-xs w-full"
                    value={selectedField.recipientEmail}
                    onChange={(e) =>
                      updateField(selectedField.id, { recipientEmail: e.target.value })
                    }
                  >
                    <option value="">Select signer</option>
                    {esignSigners.map((s) => (
                      <option key={s.email} value={s.email}>
                        {s.name || s.email}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-slate-300">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedField.required)}
                      onChange={(e) =>
                        updateField(selectedField.id, { required: e.target.checked })
                      }
                    />
                    Required
                  </label>
                  {selectedField.type === "text" && (
                    <input
                      className="rounded bg-slate-900 border border-slate-800 px-2 py-1 w-full"
                      value={selectedField.placeholder || ""}
                      onChange={(e) =>
                        updateField(selectedField.id, { placeholder: e.target.value })
                      }
                      placeholder="Placeholder"
                    />
                  )}
                  {(selectedField.type === "text" || selectedField.type === "date") && (
                    <input
                      className="rounded bg-slate-900 border border-slate-800 px-2 py-1 w-full"
                      value={selectedField.value || ""}
                      onChange={(e) =>
                        updateBoxValue(selectedField.id, e.target.value, selectedField.type)
                      }
                      placeholder={selectedField.type === "date" ? "YYYY-MM-DD" : "Printed name"}
                    />
                  )}
                  <button
                    className="btn"
                    onClick={() =>
                      setEsignFields((prev) =>
                        prev.filter((f) => f.id !== selectedField.id)
                      )
                    }
                  >
                    Remove field
                  </button>
                </div>
              )}
            </div>
          )}

          {showLegacyEsignStacks && esignStep === "invite" && esignMode !== "sign" && (
            <div className="rounded-md border border-slate-800 p-3 space-y-3">
              <div className="font-semibold text-slate-200">Step 4 — Send Invites</div>
              <div className="text-xs text-slate-300">
                Pilot mode: copy link or open an email draft.
              </div>
              <button className="btn" onClick={sendEsignInvites}>
                Send invites
              </button>
              {Object.entries(esignInviteLinks).map(([email, link]) => (
                <div key={email} className="text-xs text-slate-300 flex flex-wrap items-center gap-2">
                  <span>{email}</span>
                  <button className="btn" onClick={() => copyToClipboard(link)}>
                    Copy link
                  </button>
                  <a
                    className="btn"
                    href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
                      `Please sign: ${esignTitle || "Document"}`
                    )}&body=${encodeURIComponent(
                      `Please sign: ${link}\n\npacket_id: ${esignPacket?.packet_id}\n\nonchain (placeholder)`
                    )}`}
                  >
                    Open email draft
                  </a>
                </div>
              ))}
            </div>
          )}

          {showLegacyEsignStacks && esignStep === "sign" && esignMode !== "sign" && (
            <div className="rounded-md border border-slate-800 p-3 space-y-3">
              <div className="font-semibold text-slate-200">Step 5 — Sign & Finalize</div>
              {esignSigners.map((s, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  <span>{s.name || s.email}</span>
                  <button
                    className="btn"
                    onClick={() =>
                      s.signer_id &&
                      signEsignPacket(
                        s.signer_id,
                        s.email,
                        s.typed_name || s.name
                      )
                    }
                    disabled={!s.signer_id || !requiredFieldsComplete(s.email)}
                  >
                    Sign now
                  </button>
                  {!requiredFieldsComplete(s.email) && (
                    <span className="text-slate-400">
                      Complete required fields
                    </span>
                  )}
                  {esignCompletedByEmail.includes(s.email) && (
                    <span className="text-emerald-300">Signed</span>
                  )}
                </div>
              ))}
              <button className="btn" onClick={finalizeEsignPacket} disabled={!allEsignSigned()}>
                Finalize
              </button>
              {!allEsignSigned() && (
                <div className="text-xs text-slate-400">
                  Finalize is enabled after all signers have signed.
                </div>
              )}
            </div>
          )}

          {esignStep === "done" && (
            <div className="rounded-md border border-emerald-400/60 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200">
              Signed record created (onchain placeholder).
              <div className="mt-1">packet_id: {esignPacket?.packet_id}</div>
              <div className="mt-1">packet_sha256: {esignPacket?.packet_sha256}</div>
              <div className="mt-2">Next: Export bundle</div>
            </div>
          )}

          {esignError && (
            <div className="text-xs text-rose-300">{esignError}</div>
          )}
          {esignStatus && (
            <div className="text-xs text-emerald-300">{esignStatus}</div>
          )}
        </section>
        )}

        {phase === "liability" && (
        <section className="rounded-xl border border-slate-800 p-4 space-y-3">
          <h2 className="text-lg font-semibold">Liability Attestation</h2>
          <div className="rounded-md border border-slate-800 bg-slate-900/40 p-2 text-xs text-slate-300">
            <div className="font-semibold text-slate-200">What this does</div>
            Records role, capacity, and control assertions as evidence.
            <div className="mt-1 font-semibold text-slate-200">When to use</div>
            Use to document responsibility boundaries before export.
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/40 p-2 text-xs text-slate-300">
            <div className="font-semibold text-slate-200">
              Attestable Facts (Exportable Evidence)
            </div>
            These are factual assertions you may later export as evidence.
          </div>
          <textarea
            className="rounded bg-slate-900 border border-slate-800 px-2 py-1 w-full h-24"
            value={liabilityFactsText}
            onChange={(e) => setLiabilityFactsText(e.target.value)}
            placeholder="Describe facts you are attesting to."
          />
          <div className="rounded-md border border-slate-800 bg-slate-900/40 p-2 text-xs text-slate-300">
            <div className="font-semibold text-slate-200">
              Public Legal Context (Educational Reference Only)
            </div>
            Evidence-only. Not legal advice. Public Legal Context is educational
            reference only.
          </div>
          <textarea
            className="rounded bg-slate-900 border border-slate-800 px-2 py-1 w-full h-20"
            value={liabilityLegalContextText}
            onChange={(e) => setLiabilityLegalContextText(e.target.value)}
            placeholder="Educational context (optional)"
          />
          <input
            className="rounded bg-slate-900 border border-slate-800 px-2 py-1 w-full"
            value={liabilityLegalCitations}
            onChange={(e) => setLiabilityLegalCitations(e.target.value)}
            placeholder="Citations (optional; separate with ;)"
          />
          <div className="rounded-md border border-slate-800 bg-slate-900/40 p-2 text-xs text-slate-300">
            <div className="font-semibold text-slate-200">
              Private Notes (Private by Default)
            </div>
            Private Notes are private by default unless included.
          </div>
          <textarea
            className="rounded bg-slate-900 border border-slate-800 px-2 py-1 w-full h-20"
            value={liabilityPrivateNotes}
            onChange={(e) => setLiabilityPrivateNotes(e.target.value)}
            placeholder="Private notes (optional)"
          />
          <details className="rounded border border-slate-800 p-2 text-xs text-slate-300">
            <summary className="cursor-pointer text-slate-200">
              Advanced export options
            </summary>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
              <label className="text-xs text-slate-300 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includePublicLegalContext}
                  onChange={(e) => setIncludePublicLegalContext(e.target.checked)}
                />
                Include Public Legal Context in Export Bundle (default OFF)
              </label>
              <label className="text-xs text-slate-300 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includePrivateNotes}
                  onChange={(e) => setIncludePrivateNotes(e.target.checked)}
                />
                Include Private Notes in Export Bundle (default OFF)
              </label>
            </div>
          </details>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
              value={liabilityAuthorName}
              onChange={(e) => setLiabilityAuthorName(e.target.value)}
              placeholder="author name"
            />
            <input
              className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
              value={liabilityAuthorRole}
              onChange={(e) => setLiabilityAuthorRole(e.target.value)}
              placeholder="author role"
            />
            <input
              className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
              value={liabilityUpdatedAt}
              onChange={(e) => setLiabilityUpdatedAt(e.target.value)}
              placeholder="updated_at"
            />
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={saveLiabilityDraft}>
              Save Draft
            </button>
            <button
              className="btn"
              onClick={finalizeLiability}
              disabled={!liabilityHasDraft}
            >
              Finalize
            </button>
          </div>
          {!liabilityHasDraft && (
            <div className="text-xs text-slate-400">
              Save Draft to enable Finalize.
            </div>
          )}
          {liabilityPacketSha && (
            <div className="text-xs text-slate-400">
              draft_sha256={liabilityPacketSha}
            </div>
          )}
          {liabilityError && (
            <div className="text-xs text-rose-300">{liabilityError}</div>
          )}
          {liabilityStatus && (
            <div className="text-xs text-emerald-300">{liabilityStatus}</div>
          )}
          <pre className="text-xs bg-slate-900 border border-slate-800 rounded p-2 overflow-auto">
            {prettyJson(liability)}
          </pre>
        </section>
        )}

        {false && (
        <section className="rounded-xl border border-slate-800 p-4 space-y-3">
          <h2 className="text-lg font-semibold">Dispute Packet</h2>
          <textarea
            className="rounded bg-slate-900 border border-slate-800 px-2 py-1 w-full h-16"
            value={claims}
            onChange={(e) => setClaims(e.target.value)}
          />
          <textarea
            className="rounded bg-slate-900 border border-slate-800 px-2 py-1 w-full h-16"
            value={references}
            onChange={(e) => setReferences(e.target.value)}
          />
          <textarea
            className="rounded bg-slate-900 border border-slate-800 px-2 py-1 w-full h-16"
            value={timelines}
            onChange={(e) => setTimelines(e.target.value)}
          />
          <button className="btn" onClick={createDispute}>
            Create Dispute Packet
          </button>
          <pre className="text-xs bg-slate-900 border border-slate-800 rounded p-2 overflow-auto">
            {prettyJson(dispute)}
          </pre>
        </section>
        )}

        {false && (
        <section className="rounded-xl border border-slate-800 p-4 space-y-3">
          <h2 className="text-lg font-semibold">Export Bundle</h2>
          <div className="text-xs text-slate-400">
            Agreement attachment: {attachAgreement ? "ON" : "OFF"}
          </div>
          <input
            className="rounded bg-slate-900 border border-slate-800 px-2 py-1 w-full"
            value={exportDir}
            onChange={(e) => setExportDir(e.target.value)}
            placeholder="export directory"
          />
          <div className="flex gap-2">
            <button className="btn" onClick={exportBundle}>
              Download Proof Packet
            </button>
            <button className="btn" onClick={saveBundleDir}>
              Save Bundle Directory
            </button>
          </div>
          <pre className="text-xs bg-slate-900 border border-slate-800 rounded p-2 overflow-auto">
            {exportResult}
          </pre>
        </section>
        )}
          </>
        )}

        {phase === "agreement" && (
          <section className="rounded-xl border border-slate-800 p-4 space-y-4">
            <h2 className="text-lg font-semibold">Agreement Draft v1</h2>
            <div className="rounded-md border border-slate-800 bg-slate-900/40 p-2 text-xs text-slate-300">
              <div className="font-semibold text-slate-200">What this does</div>
              Draft and redline agreement text as a document artifact.
              <div className="mt-1 font-semibold text-slate-200">When to use</div>
              Use to capture a non-binding draft you can export and attach to
              a bundle if needed.
            </div>
            <div className="rounded-md border border-amber-400/60 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
              Draft / non-binding by default. No legal advice. Verify
              jurisdictional enforceability separately.
            </div>
            <div className="rounded-md border border-slate-800 p-3 space-y-3">
              <div className="font-semibold text-slate-200">
                Agreement Packet v1 (Multi-party)
              </div>
              <div className="text-xs text-slate-300">
                Evidence-only. CLAW does not enforce outcomes. Optional analysis
                is non-binding and excluded by default.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
                  value={agreementId}
                  onChange={(e) => setAgreementId(e.target.value)}
                  placeholder="agreement_id (optional)"
                />
                <input
                  className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
                  value={agreementTitle}
                  onChange={(e) => setAgreementTitle(e.target.value)}
                  placeholder="title"
                />
              </div>
              <div className="text-xs text-slate-300">Parties</div>
              {agreementPartyRows.map((p, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <input
                    className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
                    value={p.party_id}
                    onChange={(e) => {
                      const next = [...agreementPartyRows];
                      next[idx] = { ...next[idx], party_id: e.target.value };
                      setAgreementPartyRows(next);
                    }}
                    placeholder="party_id"
                  />
                  <input
                    className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
                    value={p.name}
                    onChange={(e) => {
                      const next = [...agreementPartyRows];
                      next[idx] = { ...next[idx], name: e.target.value };
                      setAgreementPartyRows(next);
                    }}
                    placeholder="name"
                  />
                  <input
                    className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
                    value={p.role}
                    onChange={(e) => {
                      const next = [...agreementPartyRows];
                      next[idx] = { ...next[idx], role: e.target.value };
                      setAgreementPartyRows(next);
                    }}
                    placeholder="role"
                  />
                  <input
                    className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
                    value={p.contact || ""}
                    onChange={(e) => {
                      const next = [...agreementPartyRows];
                      next[idx] = { ...next[idx], contact: e.target.value };
                      setAgreementPartyRows(next);
                    }}
                    placeholder="contact (optional)"
                  />
                </div>
              ))}
              <button
                className="btn"
                onClick={() =>
                  setAgreementPartyRows([
                    ...agreementPartyRows,
                    { party_id: "", name: "", role: "" },
                  ])
                }
              >
                Add party
              </button>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <label className="text-xs text-slate-300 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={agreementIncludeDiffs}
                    onChange={(e) => setAgreementIncludeDiffs(e.target.checked)}
                  />
                  Include diffs in export bundle (default ON)
                </label>
                <label className="text-xs text-slate-300 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={agreementIncludeNotes}
                    onChange={(e) => setAgreementIncludeNotes(e.target.checked)}
                  />
                  Include private notes in export bundle (default OFF)
                </label>
              </div>
              <input
                className="rounded bg-slate-900 border border-slate-800 px-2 py-1 w-full"
                value={agreementEscrowRef}
                onChange={(e) => setAgreementEscrowRef(e.target.value)}
                placeholder="Escrow reference (optional, e.g., escrow.com link)"
              />
              <details className="rounded border border-slate-800 p-2 text-xs text-slate-300">
                <summary className="cursor-pointer text-slate-200">
                  Optional analysis (non-binding)
                </summary>
                <div className="space-y-2 mt-2">
                  <textarea
                    className="rounded bg-slate-900 border border-slate-800 px-2 py-1 w-full h-20"
                    value={agreementAnalysisText}
                    onChange={(e) => setAgreementAnalysisText(e.target.value)}
                    placeholder="Optional non-binding analysis text (excluded by default)"
                  />
                  <label className="text-xs text-slate-300 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={agreementAnalysisInclude}
                      onChange={(e) => setAgreementAnalysisInclude(e.target.checked)}
                    />
                    Include analysis in export (requires all-party opt-in)
                  </label>
                  <label className="text-xs text-slate-300 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={agreementAnalysisOptInAll}
                      onChange={(e) => setAgreementAnalysisOptInAll(e.target.checked)}
                    />
                    All parties opt in (required)
                  </label>
                </div>
              </details>
              <div className="flex gap-2">
                <button className="btn" onClick={createAgreementPacket}>
                  Create Packet
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
                  value={agreementAuthorPartyId}
                  onChange={(e) => setAgreementAuthorPartyId(e.target.value)}
                  placeholder="author_party_id"
                />
                <input
                  className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
                  value={agreementContentType}
                  onChange={(e) => setAgreementContentType(e.target.value)}
                  placeholder="content_type"
                />
              </div>
              <textarea
                className="rounded bg-slate-900 border border-slate-800 px-2 py-1 w-full h-28"
                value={agreementBodyText}
                onChange={(e) => setAgreementBodyText(e.target.value)}
                placeholder="agreement body text"
              />
              <textarea
                className="rounded bg-slate-900 border border-slate-800 px-2 py-1 w-full h-16"
                value={agreementVersionNotes}
                onChange={(e) => setAgreementVersionNotes(e.target.value)}
                placeholder="private notes (optional)"
              />
              <div className="flex gap-2">
                <button
                  className="btn"
                  onClick={addAgreementVersionPacket}
                  disabled={!agreementPacket}
                >
                  Add Version
                </button>
                <button
                  className="btn"
                  onClick={finalizeAgreementPacket}
                  disabled={!agreementHasVersions}
                >
                  Finalize
                </button>
              </div>
              {!agreementPacket && (
                <div className="text-xs text-slate-400">
                  Create Packet to enable Add Version.
                </div>
              )}
              {agreementPacket && !agreementHasVersions && (
                <div className="text-xs text-slate-400">
                  Add at least one version to enable Finalize.
                </div>
              )}
              {agreementPacketError && (
                <div className="text-xs text-rose-300">{agreementPacketError}</div>
              )}
              {agreementPacketStatus && (
                <div className="text-xs text-emerald-300">
                  {agreementPacketStatus}
                </div>
              )}
              {agreementPacket?.versions?.length > 0 && (
                <div className="text-xs text-slate-300">
                  <div className="font-semibold text-slate-200">Versions</div>
                  {agreementPacket.versions.map((v: any) => (
                    <div key={v.version_id} className="mt-2">
                      <div>
                        {v.version_id} • {v.created_at} • {v.author_party_id} •{" "}
                        {v.body_sha256}
                      </div>
                      {v.diff_from_prev && (
                        <button
                          className="btn mt-2 text-xs"
                          onClick={() =>
                            setAgreementDiffOpen((prev) => ({
                              ...prev,
                              [v.version_id]: !prev[v.version_id],
                            }))
                          }
                        >
                          {agreementDiffOpen[v.version_id]
                            ? "Hide Diff"
                            : "Show Diff"}
                        </button>
                      )}
                      {agreementDiffOpen[v.version_id] && v.diff_from_prev && (
                        <pre className="text-xs bg-slate-900 border border-slate-800 rounded p-2 overflow-auto mt-2">
                          {v.diff_from_prev}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
                value={agreementId}
                onChange={(e) => setAgreementId(e.target.value)}
                placeholder="agreement_id"
              />
              <input
                className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
                value={agreementTitle}
                onChange={(e) => setAgreementTitle(e.target.value)}
                placeholder="title"
              />
              <input
                className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
                value={agreementJurisdiction}
                onChange={(e) => setAgreementJurisdiction(e.target.value)}
                placeholder="jurisdiction"
              />
              <input
                className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
                value={agreementParties}
                onChange={(e) => setAgreementParties(e.target.value)}
                placeholder="parties (separate with ;) "
              />
              <input
                className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
                value={agreementEffectiveDate}
                onChange={(e) => setAgreementEffectiveDate(e.target.value)}
                placeholder="effective_date"
              />
              <input
                className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
                value={createdAt}
                onChange={(e) => setCreatedAt(e.target.value)}
                placeholder="created_at"
              />
            </div>
            <textarea
              className="rounded bg-slate-900 border border-slate-800 px-2 py-1 w-full h-32"
              value={agreementContent}
              onChange={(e) => setAgreementContent(e.target.value)}
              placeholder="agreement body (markdown)"
            />
            <div className="flex gap-2">
              <button className="btn" onClick={createAgreement}>
                Create Draft
              </button>
              <button className="btn" onClick={exportAgreement}>
                Export JSON/MD
              </button>
              <button className="btn" onClick={saveAgreementVersion}>
                Save Version
              </button>
              <button className="btn" onClick={loadAgreementVersions}>
                Refresh Versions
              </button>
            </div>
            <label className="text-xs text-slate-300 flex items-center gap-2">
              <input
                type="checkbox"
                checked={attachAgreement}
                onChange={(e) => setAttachAgreement(e.target.checked)}
              />
              Attach to bundle (optional)
            </label>
            <label className="text-xs text-slate-300 flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeAgreementVersion}
                onChange={(e) => setIncludeAgreementVersion(e.target.checked)}
              />
              Include saved version files in bundle
            </label>
            {includeAgreementVersion && (
              <select
                className="rounded bg-slate-900 border border-slate-800 px-2 py-1 text-xs"
                value={agreementVersionToExport}
                onChange={(e) => setAgreementVersionToExport(e.target.value)}
              >
                <option value="">Select version</option>
                {agreementVersions.map((v: any) => (
                  <option key={v.version} value={v.version}>
                    v{v.version}
                  </option>
                ))}
              </select>
            )}
            {agreementError && (
              <div className="text-xs text-rose-300">{agreementError}</div>
            )}
            {agreementStatus && (
              <div className="text-xs text-emerald-300">{agreementStatus}</div>
            )}

            <div className="rounded-lg border border-slate-800 p-3 space-y-2">
              <div className="font-semibold text-sm">Redlines</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
                  value={redlineText}
                  onChange={(e) => setRedlineText(e.target.value)}
                  placeholder="change_text"
                />
                <input
                  className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
                  value={redlineRationale}
                  onChange={(e) => setRedlineRationale(e.target.value)}
                  placeholder="rationale"
                />
                <input
                  className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
                  value={redlineAuthor}
                  onChange={(e) => setRedlineAuthor(e.target.value)}
                  placeholder="author"
                />
                <input
                  className="rounded bg-slate-900 border border-slate-800 px-2 py-1"
                  value={redlineCreatedAt}
                  onChange={(e) => setRedlineCreatedAt(e.target.value)}
                  placeholder="created_at"
                />
              </div>
              <button className="btn" onClick={addAgreementRedline}>
                Add Redline
              </button>
              <pre className="text-xs bg-slate-900 border border-slate-800 rounded p-2 overflow-auto">
                {prettyJson(agreementRedlines)}
              </pre>
            </div>
            <div className="rounded-lg border border-slate-800 p-3 space-y-2">
              <div className="font-semibold text-sm">Versioned Redline</div>
              <div className="flex gap-2">
                <select
                  className="rounded bg-slate-900 border border-slate-800 px-2 py-1 text-xs"
                  value={fromVersion}
                  onChange={(e) => setFromVersion(e.target.value)}
                >
                  <option value="">from_version</option>
                  {agreementVersions.map((v: any) => (
                    <option key={`from-${v.version}`} value={v.version}>
                      v{v.version}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded bg-slate-900 border border-slate-800 px-2 py-1 text-xs"
                  value={toVersion}
                  onChange={(e) => setToVersion(e.target.value)}
                >
                  <option value="">to_version</option>
                  {agreementVersions.map((v: any) => (
                    <option key={`to-${v.version}`} value={v.version}>
                      v{v.version}
                    </option>
                  ))}
                </select>
                <button className="btn" onClick={generateAgreementDiff}>
                  Generate Redline
                </button>
              </div>
              <label className="text-xs text-slate-300 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeDiff}
                  onChange={(e) => setIncludeDiff(e.target.checked)}
                />
                Include redline in bundle export
              </label>
              {diffSha256 && (
                <div className="text-xs text-slate-400">
                  diff_sha256: {diffSha256}
                </div>
              )}
              {diffText && (
                <>
                  <button
                    className="btn"
                    onClick={() => copyToClipboard(diffText)}
                  >
                    Copy Redline
                  </button>
                  <pre className="text-xs bg-slate-900 border border-slate-800 rounded p-2 overflow-auto">
                    {diffText}
                  </pre>
                </>
              )}
            </div>

            <pre className="text-xs bg-slate-900 border border-slate-800 rounded p-2 overflow-auto">
              {prettyJson(agreement)}
            </pre>
            {agreementExport?.json_url && agreementExport?.md_url && (
              <div className="text-xs text-emerald-300 space-x-3">
                <a
                  className="underline"
                  href={agreementExport.json_url}
                  download={agreementExport.filename_json || "agreement.json"}
                >
                  Download JSON
                </a>
                <a
                  className="underline"
                  href={agreementExport.md_url}
                  download={agreementExport.filename_md || "agreement.md"}
                >
                  Download Markdown
                </a>
              </div>
            )}
          </section>
        )}

        {phase === "verify" && (
          <section className="rounded-xl border border-slate-800 p-4 space-y-3">
            <h2 className="text-lg font-semibold">Bundle Verifier</h2>
            <input
              type="file"
              accept=".zip"
              onChange={(e) => setVerifyFiles(e.target.files)}
            />
            <button className="btn" onClick={runVerify}>
              Verify Bundle
            </button>
            {verifyError && (
              <div className="text-sm text-rose-300">{verifyError}</div>
            )}
            {verifyReport && (
              <div className="text-sm">
                <div className={verifyReport.ok ? "text-emerald-300" : "text-rose-300"}>
                  {verifyReport.ok ? "PASS" : "FAIL"}
                </div>
                <pre className="text-xs bg-slate-900 border border-slate-800 rounded p-2 overflow-auto">
                  {prettyJson(verifyReport)}
                </pre>
                <button
                  className="btn"
                  onClick={() => {
                    const blob = new Blob([prettyJson(verifyReport)], {
                      type: "application/json",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "verification_report.json";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Download Report
                </button>
              </div>
            )}
          </section>
        )}
        <footer className="text-xs text-slate-500 border-t border-slate-900 pt-4">
          Evidence-only system. See `docs/PRODUCT_BOUNDARY.md` for scope and
          disclaimers.
        </footer>
      </div>
    </div>
  );
};

export default App;
