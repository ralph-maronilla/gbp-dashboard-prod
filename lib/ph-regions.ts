/**
 * The 18 administrative regions of the Philippines (including the Negros Island Region re-created in 2024), with
 * their island group, and a keyword map to detect a location's region from its address or name.
 */

export type IslandGroup = "Luzon" | "Visayas" | "Mindanao";

export interface PhRegion {
  /** Stored in locations.region. */
  code: string;
  name: string;
  island: IslandGroup;
}

export const PH_REGIONS: PhRegion[] = [
  { code: "NCR", name: "NCR (Metro Manila)", island: "Luzon" },
  { code: "CAR", name: "CAR (Cordillera)", island: "Luzon" },
  { code: "I", name: "Region I (Ilocos Region)", island: "Luzon" },
  { code: "II", name: "Region II (Cagayan Valley)", island: "Luzon" },
  { code: "III", name: "Region III (Central Luzon)", island: "Luzon" },
  { code: "IV-A", name: "Region IV-A (CALABARZON)", island: "Luzon" },
  { code: "MIMAROPA", name: "MIMAROPA", island: "Luzon" },
  { code: "V", name: "Region V (Bicol Region)", island: "Luzon" },
  { code: "VI", name: "Region VI (Western Visayas)", island: "Visayas" },
  { code: "VII", name: "Region VII (Central Visayas)", island: "Visayas" },
  { code: "VIII", name: "Region VIII (Eastern Visayas)", island: "Visayas" },
  { code: "NIR", name: "NIR (Negros Island Region)", island: "Visayas" },
  { code: "IX", name: "Region IX (Zamboanga Peninsula)", island: "Mindanao" },
  { code: "X", name: "Region X (Northern Mindanao)", island: "Mindanao" },
  { code: "XI", name: "Region XI (Davao Region)", island: "Mindanao" },
  { code: "XII", name: "Region XII (SOCCSKSARGEN)", island: "Mindanao" },
  { code: "XIII", name: "Region XIII (Caraga)", island: "Mindanao" },
  { code: "BARMM", name: "BARMM (Bangsamoro)", island: "Mindanao" },
];

export const REGION_CODES = PH_REGIONS.map((r) => r.code);
export const ISLAND_GROUPS: IslandGroup[] = ["Luzon", "Visayas", "Mindanao"];
const byCode = new Map(PH_REGIONS.map((r) => [r.code, r]));
export const regionName = (code: string | null | undefined) => (code ? (byCode.get(code)?.name ?? code) : null);
export const regionIsland = (code: string | null | undefined) => (code ? (byCode.get(code)?.island ?? null) : null);

/**
 * Province, city and well-known place names (as they appear in Google addresses and branch names) → region code.
 * Longer phrases are checked first, so "San Jose del Monte" wins over "San Jose".
 */
const PLACES: Record<string, string[]> = {
  NCR: [
    "metro manila", "manila", "makati", "taguig", "bonifacio global city", "bgc", "pasig", "ortigas", "mandaluyong",
    "quezon city", "san juan", "marikina", "caloocan", "malabon", "navotas", "valenzuela", "pasay", "paranaque",
    "parañaque", "las pinas", "las piñas", "muntinlupa", "alabang", "pateros", "cubao", "greenhills", "ermita", "malate",
    "sampaloc", "binondo", "quiapo", "santa mesa", "sta. mesa", "eastwood", "cloverleaf", "up town center", "uptown center",
    "shangri-la plaza", "greenbelt", "glorietta", "market! market!", "market market", "festival mall", "manila bay",
    "sm the block", "trinoma", "one ayala", "adriatico",
  ],
  CAR: ["baguio", "benguet", "abra", "apayao", "ifugao", "kalinga", "mountain province", "la trinidad"],
  I: ["ilocos norte", "ilocos sur", "la union", "pangasinan", "laoag", "vigan", "san fernando, la union", "dagupan", "alaminos", "urdaneta"],
  II: ["cagayan valley", "batanes", "cagayan", "isabela", "nueva vizcaya", "quirino", "tuguegarao", "santiago city", "cauayan"],
  III: [
    "aurora", "bataan", "bulacan", "nueva ecija", "pampanga", "tarlac", "zambales", "olongapo", "angeles", "clark",
    "san fernando, pampanga", "malolos", "meycauayan", "san jose del monte", "sjdm", "cabanatuan", "balanga", "marilao",
  ],
  "IV-A": [
    "calabarzon", "cavite", "laguna", "batangas", "rizal", "quezon province", "lucena", "imus", "bacoor", "dasmarinas",
    "dasmariñas", "general trias", "tagaytay", "santa rosa", "sta. rosa", "nuvali", "binan", "biñan", "calamba",
    "san pedro, laguna", "los banos", "los baños", "antipolo", "cainta", "taytay", "lipa", "batangas city", "tanauan",
  ],
  MIMAROPA: ["mimaropa", "mindoro", "marinduque", "romblon", "palawan", "puerto princesa", "calapan"],
  V: ["bicol", "albay", "camarines norte", "camarines sur", "catanduanes", "masbate", "sorsogon", "legazpi", "naga city"],
  VI: ["western visayas", "aklan", "antique", "capiz", "guimaras", "iloilo", "roxas city", "boracay", "kalibo"],
  VII: ["central visayas", "cebu", "bohol", "mandaue", "lapu-lapu", "lapu lapu", "talisay, cebu", "tagbilaran", "velez"],
  VIII: ["eastern visayas", "leyte", "southern leyte", "samar", "biliran", "tacloban", "ormoc", "catbalogan"],
  NIR: ["negros island region", "negros occidental", "negros oriental", "siquijor", "bacolod", "dumaguete"],
  IX: ["zamboanga", "zamboanga del norte", "zamboanga del sur", "zamboanga sibugay", "dipolog", "pagadian"],
  X: ["northern mindanao", "bukidnon", "camiguin", "lanao del norte", "misamis occidental", "misamis oriental", "cagayan de oro", "iligan", "valencia city", "centrio"],
  XI: ["davao", "davao del norte", "davao del sur", "davao oriental", "davao de oro", "davao occidental", "tagum", "digos", "abreeza", "lanang"],
  XII: ["soccsksargen", "south cotabato", "cotabato", "sultan kudarat", "sarangani", "general santos", "koronadal", "kidapawan"],
  XIII: ["caraga", "agusan del norte", "agusan del sur", "surigao", "dinagat", "butuan", "bayugan"],
  BARMM: ["bangsamoro", "barmm", "maguindanao", "lanao del sur", "basilan", "sulu", "tawi-tawi", "marawi", "cotabato city"],
};

const ENTRIES = Object.entries(PLACES)
  .flatMap(([code, names]) => names.map((n) => ({ code, n: n.toLowerCase() })))
  .sort((a, b) => b.n.length - a.n.length);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PATTERNS = ENTRIES.map((e) => ({ code: e.code, re: new RegExp(`(?<![\\p{L}])${escape(e.n)}(?![\\p{L}])`, "giu") }));

/**
 * The region named in `text` (an address or branch name), or null. Addresses end with city and province, so the match
 * that ends latest wins ("Rizal Ave, Iloilo City" → Western Visayas); at the same end, the longer name wins
 * ("Cotabato City" → BARMM over "Cotabato"). Two different regions that tie → null.
 */
export function detectRegion(text: string | null | undefined): string | null {
  if (!text) return null;
  let best: { code: string; end: number; len: number } | null = null;
  let tie = false;
  for (const p of PATTERNS) {
    for (const m of text.matchAll(p.re)) {
      const end = (m.index ?? 0) + m[0].length;
      const len = m[0].length;
      if (!best || end > best.end || (end === best.end && len > best.len)) {
        tie = false;
        best = { code: p.code, end, len };
      } else if (end === best.end && len === best.len && p.code !== best.code) tie = true;
    }
  }
  return best && !tie ? best.code : null;
}

/** Google's place type ("Medical clinic", "Hospital") → our location type, for filling an empty Type. */
export function typeFromGoogle(type: string | null | undefined): string | null {
  const t = (type ?? "").toLowerCase();
  if (t.includes("hospital")) return "Hospital";
  if (t.includes("diagnostic") || t.includes("laborator") || t.includes("imaging")) return "Diagnostic Center";
  if (t.includes("dialysis") || t.includes("cancer") || t.includes("specialist")) return "Specialty Center";
  if (t.includes("clinic") || t.includes("medical")) return "Outpatient Center";
  return null;
}

/**
 * Network areas, as in the Healthway sample dashboard: Metro Manila split into North / East / South (the City of
 * Manila counts as North), the rest of Luzon in three parts, then Visayas and Mindanao. Dashboard rows follow this order.
 */
export const AREA_ORDER = ["Metro North", "Metro East", "Metro South", "Metro Manila", "North Luzon", "Central Luzon", "South Luzon", "Visayas", "Mindanao"];

const METRO_CITIES: Record<string, string[]> = {
  "Metro North": ["quezon city", "caloocan", "valenzuela", "malabon", "navotas", "manila"],
  "Metro East": ["pasig", "mandaluyong", "san juan", "marikina"],
  "Metro South": ["makati", "taguig", "pasay", "paranaque", "parañaque", "las pinas", "las piñas", "muntinlupa", "pateros"],
};
const METRO_PATTERNS = Object.entries(METRO_CITIES)
  .flatMap(([area, names]) => names.map((n) => ({ area, re: new RegExp(`(?<![\\p{L}])${escape(n)}(?![\\p{L}])`, "giu") })));

/**
 * Metro Manila area of an NCR address. Addresses end with the city, so the city that ends latest wins ("Ayala Malls
 * Manila Bay, Aseana City, Parañaque" → South). "Metro Manila" itself is ignored. No known city → "Metro Manila".
 */
export function metroArea(address: string | null | undefined): string {
  const text = (address ?? "").replace(/metro\s+manila/giu, " ");
  let best: { area: string; end: number } | null = null;
  for (const p of METRO_PATTERNS) {
    for (const m of text.matchAll(p.re)) {
      const end = (m.index ?? 0) + m[0].length;
      if (!best || end > best.end) best = { area: p.area, end };
    }
  }
  return best?.area ?? "Metro Manila";
}

const LUZON_AREA: Record<string, string> = { CAR: "North Luzon", I: "North Luzon", II: "North Luzon", III: "Central Luzon", "IV-A": "South Luzon", MIMAROPA: "South Luzon", V: "South Luzon" };

/** Network area of a location from its region code and address; null when the region is not set. */
export function areaOf(region: string | null | undefined, address: string | null | undefined): string | null {
  if (!region) return null;
  if (region === "NCR") return metroArea(address);
  const island = regionIsland(region);
  return island === "Luzon" ? (LUZON_AREA[region] ?? null) : island;
}

/**
 * Location segments, as in the sample's heatmap: hospitals split by Metro Manila vs provinces, outpatient centers, and specialty
 * or diagnostic centers. Worked out from Type and Region (see segmentSql in lib/data/insight-scope.ts).
 */
export const SEGMENT_ORDER = ["Metro Hospitals", "Provincial Hospitals", "Outpatient Centers", "Specialty Centers"];
