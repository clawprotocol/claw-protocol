/** Deterministic US / general cleanup for governing-law fields (mirrors backend `normalize_jurisdiction_display`). */

const US_STATE_ABBR: Record<string, string> = {
  al: "Alabama",
  ak: "Alaska",
  az: "Arizona",
  ar: "Arkansas",
  ca: "California",
  co: "Colorado",
  ct: "Connecticut",
  de: "Delaware",
  dc: "District of Columbia",
  fl: "Florida",
  ga: "Georgia",
  hi: "Hawaii",
  id: "Idaho",
  il: "Illinois",
  in: "Indiana",
  ia: "Iowa",
  ks: "Kansas",
  ky: "Kentucky",
  la: "Louisiana",
  me: "Maine",
  md: "Maryland",
  ma: "Massachusetts",
  mi: "Michigan",
  mn: "Minnesota",
  ms: "Mississippi",
  mo: "Missouri",
  mt: "Montana",
  ne: "Nebraska",
  nv: "Nevada",
  nh: "New Hampshire",
  nj: "New Jersey",
  nm: "New Mexico",
  ny: "New York",
  nc: "North Carolina",
  nd: "North Dakota",
  oh: "Ohio",
  ok: "Oklahoma",
  or: "Oregon",
  pa: "Pennsylvania",
  ri: "Rhode Island",
  sc: "South Carolina",
  sd: "South Dakota",
  tn: "Tennessee",
  tx: "Texas",
  ut: "Utah",
  vt: "Vermont",
  va: "Virginia",
  wa: "Washington",
  wv: "West Virginia",
  wi: "Wisconsin",
  wy: "Wyoming",
};

const US_STATE_FULL: Record<string, string> = {
  "new york": "New York",
  "new jersey": "New Jersey",
  "new mexico": "New Mexico",
  "new hampshire": "New Hampshire",
  "north carolina": "North Carolina",
  "north dakota": "North Dakota",
  "south carolina": "South Carolina",
  "south dakota": "South Dakota",
  "west virginia": "West Virginia",
  "rhode island": "Rhode Island",
  "district of columbia": "District of Columbia",
  oklahoma: "Oklahoma",
};

function titleCaseWords(s: string): string {
  const t = s.trim();
  if (!t) return t;
  const small = new Set(["of", "and", "the", "in", "on", "at", "for", "to", "a", "an"]);
  const parts = t.split(/(\s+|-)/);
  let wordIdx = 0;
  const out: string[] = [];
  for (const p of parts) {
    if (/^\s+$/.test(p) || p === "-") {
      out.push(p);
      continue;
    }
    const low = p.toLowerCase();
    if (wordIdx > 0 && small.has(low)) out.push(low);
    else if (p.length === 2 && /^[A-Za-z]{2}$/.test(p) && p === p.toUpperCase()) out.push(p.toUpperCase());
    else out.push(p.length > 1 ? p.slice(0, 1).toUpperCase() + p.slice(1).toLowerCase() : p.toUpperCase());
    wordIdx += 1;
  }
  return out.join("");
}

export function normalizeJurisdictionDisplay(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return s;
  const key = s.toLowerCase().replace(/\s+/g, " ").trim();
  if (US_STATE_ABBR[key]) return US_STATE_ABBR[key];
  if (US_STATE_FULL[key]) return US_STATE_FULL[key];
  return titleCaseWords(s);
}
