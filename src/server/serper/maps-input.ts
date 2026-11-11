/**
 * Turns what an admin pastes (Maps link or CID) into the place's CID, without any API call. The CID is the one identity
 * every location is stored under, so the same place can never be added twice under different link types.
 * Supported:
 *  - CID: "9299316743109092810", "...?cid=9299...", "ludocid=9299..."
 *  - Feature id inside place links: "!1s0x3397b6e29464e389:0x810dcf4ed6dc25ca" (CID = second half as decimal)
 * Not supported: place IDs ("ChIJ..."). They can't be compared with a stored CID without a paid lookup, so they are
 * rejected instead of risking a duplicate.
 * Short links (maps.app.goo.gl) must be expanded first (see isShortMapsLink).
 */
export type PlaceKey = { cid: string } | { placeId: string };

export interface ParsedMapsInput {
  /** Canonical CID: decimal digits, no leading zeros. */
  cid: string;
  /** Name taken from a "/maps/place/<Name>/" link, if present. */
  name: string | null;
}

const CID_RE = /^\d{6,20}$/;

/** "009299…" and "9299…" are the same place: always store the canonical decimal form. */
function canonicalCid(digits: string): string {
  return BigInt(digits).toString();
}

export function parseMapsInput(raw: string): ParsedMapsInput | null {
  const text = raw.trim();
  if (!text) return null;
  if (CID_RE.test(text)) return { cid: canonicalCid(text), name: null };

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const nameMatch = /\/maps\/place\/([^/@]+)/.exec(url.pathname);
  const name = nameMatch ? decodeURIComponent((nameMatch[1] as string).replace(/\+/g, " ")).trim() || null : null;

  const cid = url.searchParams.get("cid") ?? url.searchParams.get("ludocid");
  if (cid && CID_RE.test(cid)) return { cid: canonicalCid(cid), name };

  const fid = /!1s0x[0-9a-f]+:(0x[0-9a-f]+)/i.exec(decodeURIComponent(url.href));
  if (fid) return { cid: BigInt(fid[1] as string).toString(), name };
  return null;
}

/** True for a pasted place ID ("ChIJ...", "place_id:ChIJ..."), so the UI can explain why it is not accepted. */
export function looksLikePlaceId(raw: string): boolean {
  return /^(place_id:)?ChIJ[\w-]{10,}$/.test(raw.trim()) || /[?&](query_)?place_id=ChIJ/.test(raw);
}

/** Short Maps links resolve to a full place link via one redirect (free, no Serper credit). */
export function isShortMapsLink(text: string): boolean {
  try {
    const host = new URL(text.trim()).hostname;
    return host === "maps.app.goo.gl" || host === "goo.gl";
  } catch {
    return false;
  }
}
