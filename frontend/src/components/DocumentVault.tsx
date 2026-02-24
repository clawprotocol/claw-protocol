import React, { useEffect, useMemo, useState } from "react";

export type VaultDoc = {
  id: string;
  name: string;
  kind: "document" | "export";
  mimeType: string;
  size: number;
  createdAt: number;
  dataUrl?: string;
  note?: string;
};

const VAULT_KEY = "claw.document.vault.v1";

function makeId(prefix: "doc" | "bundle") {
  return `${prefix}_${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

export const loadVaultDocs = (): VaultDoc[] => {
  try {
    const raw = window.localStorage.getItem(VAULT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveVaultDocs = (docs: VaultDoc[]) => {
  try {
    window.localStorage.setItem(VAULT_KEY, JSON.stringify(docs.slice(0, 300)));
  } catch {
    // ignore localStorage limits in mocked mode
  }
};

type Props = {
  open: boolean;
  title?: string;
  onClose: () => void;
  onAttach?: (docs: VaultDoc[]) => void;
};

const DocumentVault: React.FC<Props> = ({ open, onClose, onAttach, title = "Document Vault" }) => {
  const [docs, setDocs] = useState<VaultDoc[]>([]);
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const next = loadVaultDocs();
    setDocs(next);
    setSelectedIds([]);
    setPreviewId(next[0]?.id || null);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q));
  }, [docs, query]);

  const preview = docs.find((d) => d.id === previewId) || filtered[0] || null;

  const persist = (next: VaultDoc[]) => {
    setDocs(next);
    saveVaultDocs(next);
  };

  const addDocument = (file: File, metadata?: { kind?: "document" | "export"; note?: string }) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : undefined;
      const next: VaultDoc[] = [
        {
          id: metadata?.kind === "export" ? makeId("bundle") : makeId("doc"),
          name: file.name,
          kind: metadata?.kind || "document",
          mimeType: file.type || "application/octet-stream",
          size: file.size || 0,
          createdAt: Date.now(),
          dataUrl,
          note: metadata?.note,
        },
        ...docs,
      ];
      persist(next);
      setPreviewId(next[0].id);
    };
    reader.readAsDataURL(file);
  };

  const saveMockExport = () => {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), source: "CLAW UI mock export" }, null, 2)], {
      type: "application/json",
    });
    const file = new File([blob], `claw-export-${Date.now()}.json`, { type: "application/json" });
    addDocument(file, { kind: "export", note: "Saved from export action" });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[250] bg-black/60" onClick={onClose}>
      <div
        className="fixed bottom-0 left-0 right-0 h-[82vh] rounded-t-xl border border-slate-700 bg-slate-900 p-3 sm:inset-6 sm:h-auto sm:rounded-xl sm:max-w-5xl sm:mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-100">{title}</div>
          <button className="btn text-xs" onClick={onClose}>Close</button>
        </div>
        <div className="mb-2 flex flex-col gap-2 sm:flex-row">
          <input
            className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
            placeholder="Search by name or ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="btn text-xs cursor-pointer text-center">
            Add File
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.item(0);
                if (file) addDocument(file, { kind: "document" });
              }}
            />
          </label>
          <button className="btn text-xs" onClick={saveMockExport}>Save export to Vault</button>
          {onAttach && (
            <button
              className="btn text-xs bg-emerald-600 hover:bg-emerald-500"
              onClick={() => onAttach(docs.filter((d) => selectedIds.includes(d.id)))}
            >
              Attach selected
            </button>
          )}
        </div>
        <div className="grid h-[calc(100%-92px)] grid-cols-1 gap-3 overflow-hidden sm:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
          <div className="overflow-auto rounded border border-slate-700">
            {filtered.length === 0 ? (
              <div className="p-3 text-xs text-slate-400">No documents yet.</div>
            ) : (
              filtered.map((d) => (
                <button
                  key={d.id}
                  className={`w-full border-b border-slate-800 px-3 py-2 text-left hover:bg-slate-800/40 ${previewId === d.id ? "bg-slate-800/50" : ""}`}
                  onClick={() => setPreviewId(d.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-slate-100">{d.name}</div>
                      <div className="text-[11px] text-slate-400">{d.id} • {d.kind}</div>
                    </div>
                    {onAttach && (
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(d.id)}
                        onChange={(e) =>
                          setSelectedIds((prev) =>
                            e.target.checked ? [...prev, d.id] : prev.filter((id) => id !== d.id)
                          )
                        }
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="overflow-auto rounded border border-slate-700 p-3">
            {!preview ? (
              <div className="text-xs text-slate-400">Select a document to preview.</div>
            ) : (
              <div className="space-y-2 text-xs text-slate-300">
                <div className="font-medium text-slate-100">{preview.name}</div>
                <div>{preview.id}</div>
                <div>{preview.mimeType} • {Math.round((preview.size || 0) / 1024)} KB</div>
                {preview.dataUrl?.startsWith("data:image/") && (
                  <img src={preview.dataUrl} alt="" className="max-h-64 rounded border border-slate-700 object-contain" />
                )}
                {preview.dataUrl?.startsWith("data:application/pdf") && (
                  <iframe title="preview" src={preview.dataUrl} className="h-64 w-full rounded border border-slate-700" />
                )}
                {!preview.dataUrl && <div className="text-slate-500">No preview available.</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentVault;
