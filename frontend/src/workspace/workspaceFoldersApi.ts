import { clawAgreementHeaders } from "../agreement/agreementOrgHeaders";
import { apiUrl, errorMessageFromResponse, logClawClientWarning } from "../lib/clawApi";

export type ProofFolderRow = {
  folder_id: string;
  folder_name: string;
  owner_subject?: string;
  parent_folder_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

export async function fetchProofFolders(): Promise<{
  folders: ProofFolderRow[];
  error: string | null;
}> {
  const url = apiUrl("/v1/proof/folders");
  try {
    const res = await fetch(url, { headers: clawAgreementHeaders() });
    if (!res.ok) {
      return {
        folders: [],
        error: await errorMessageFromResponse(res, "Could not load folders."),
      };
    }
    const j = (await res.json()) as { folders?: ProofFolderRow[] };
    return { folders: Array.isArray(j.folders) ? j.folders : [], error: null };
  } catch (e) {
    logClawClientWarning("proof.folders.list", { error: String(e), url });
    return { folders: [], error: "Network error loading folders." };
  }
}

export async function createProofFolder(folderName: string): Promise<{
  ok: boolean;
  folder?: ProofFolderRow;
  error?: string;
}> {
  const name = folderName.trim();
  if (!name) return { ok: false, error: "Folder name is required." };
  const url = apiUrl("/v1/proof/folders");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ folder_name: name }),
    });
    if (!res.ok) {
      return { ok: false, error: await errorMessageFromResponse(res, "Could not create folder.") };
    }
    const j = (await res.json()) as { folder?: ProofFolderRow };
    if (!j.folder?.folder_id) return { ok: false, error: "Invalid response." };
    return { ok: true, folder: j.folder };
  } catch (e) {
    logClawClientWarning("proof.folders.create", { error: String(e), url });
    return { ok: false, error: "Network error." };
  }
}
