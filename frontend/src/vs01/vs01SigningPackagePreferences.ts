/** Signing-package preferences collected during Add Signers / setup — shared with VS01 prepare. */

const LS_PREFIX = "claw_vs01_signing_pkg_pref_v1_";

export type Vs01SigningPackagePreferencesV1 = {
  v: 1;
  autoInitialsEveryPage: boolean;
  savedAt: string;
};

function storageKey(agreementId: string): string {
  return `${LS_PREFIX}${encodeURIComponent(agreementId.trim())}`;
}

export function readVs01SigningPackagePreferences(
  agreementId: string,
): Vs01SigningPackagePreferencesV1 | null {
  const id = agreementId.trim();
  if (!id || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Vs01SigningPackagePreferencesV1;
    if (parsed?.v !== 1 || typeof parsed.autoInitialsEveryPage !== "boolean") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeVs01SigningPackagePreferences(
  agreementId: string,
  prefs: Pick<Vs01SigningPackagePreferencesV1, "autoInitialsEveryPage">,
): void {
  const id = agreementId.trim();
  if (!id || typeof localStorage === "undefined") return;
  const full: Vs01SigningPackagePreferencesV1 = {
    v: 1,
    autoInitialsEveryPage: prefs.autoInitialsEveryPage,
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(storageKey(id), JSON.stringify(full));
  } catch {
    /* ignore quota */
  }
}
