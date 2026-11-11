/**
 * Review themes for the Dashboard's Sentiment and Review Intelligence tabs, detected offline by keywords (English and
 * Tagalog/Taglish as written in the reviews). A review can mention several themes. How each mention feels is read from
 * the words around it (./sentiment.ts), falling back to the star rating. To tune detection, edit the keyword lists:
 * every number on the Dashboard is computed from them at read time, so a change applies to all reviews at once.
 *
 * Keyword syntax: plain words match whole words ("doc" does not match "document"); a trailing * matches any ending
 * ("wait*" matches wait, waited, waiting); spaces inside a keyword match one or more spaces.
 */

export const THEME_KEYS = ["waiting", "doctors", "staff", "billing", "facilities", "appointments", "diagnostics", "commendations"] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];

export interface ThemeDef {
  key: ThemeKey;
  label: string;
  /** Positive Commendations is judged by its positive share instead of its negative share. */
  kind: "issue" | "commendation";
  keywords: string[];
  /** Shown under Recommended Actions when the theme is a Priority or Watch area. */
  action: string;
}

export const THEMES: ThemeDef[] = [
  {
    key: "waiting",
    label: "Waiting Time",
    kind: "issue",
    keywords: [
      "wait*", "queue*", "long line*", "pila*", "pumila*", "antay*", "hintay*", "naghintay*", "matagal", "tagal", "katagal",
      // "slowly" alone is not a wait ("slowly explaining", "slowly build my confidence").
      "slow", "slower", "slowest", "slowness", "very slowly", "so slowly", "too slowly", "bagal*", "mabagal", "delay*", "took hours", "for hours", "hours waiting", "waste of time", "sayang oras",
    ],
    action: "Validate peak-hour workflows and queue handling to reduce waiting time.",
  },
  {
    key: "doctors",
    label: "Doctors / Care",
    kind: "issue",
    keywords: [
      "doctor*", "doc", "docs", "dr", "dra", "doktor*", "physician*", "ob", "obgyn", "ob-gyn", "pedia*", "surgeon*",
      "specialist*", "consultant*", "consultation*", "diagnos*", "misdiagnos*", "dentist*", "cardiologist*", "urologist*",
      "treatment*", "check up", "checkup", "check-up",
    ],
    action: "Review consultation quality and doctor-patient communication on the flagged cases.",
  },
  {
    key: "staff",
    label: "Staff / Service",
    kind: "issue",
    keywords: [
      "staff*", "nurse*", "nursing", "receptionist*", "front desk", "information desk", "guard*", "cashier*", "secretary",
      "employee*", "personnel", "attendant*", "customer service", "accommodating", "accomodating", "approachable", "friendly",
      "polite", "rude", "unprofessional", "mabait", "magalang", "matulungin", "bastos", "sungit", "masungit", "suplada",
    ],
    action: "Coach front-line staff on courtesy and clear instructions; recognise the staff named in praise.",
  },
  {
    key: "billing",
    label: "Billing",
    kind: "issue",
    keywords: [
      "bill", "bills", "billing*", "charges", "charged", "overcharg*", "price*", "pricing", "expensive", "ang mahal",
      "sobrang mahal", "napakamahal", "mahal ng", "mura", "hmo*", "philhealth", "payment*", "paid", "bayad*", "binayaran",
      "singil*", "maningil", "fee", "fees", "cost", "costs", "costly", "costing", "deposit*", "pesos",
    ],
    action: "Review billing communication: clear estimates, HMO coverage and discharge billing turnaround.",
  },
  {
    key: "facilities",
    label: "Facilities",
    kind: "issue",
    keywords: [
      "clean", "cleaner", "cleanliness", "unclean", "dirty", "parking", "aircon*", "air con", "air conditioning", "comfort room*", "cr", "toilet*", "restroom*",
      "bathroom*", "lobby", "facility", "facilities", "elevator*", "waiting area", "smell*", "mabaho", "malinis", "marumi",
      "mainit", "crowded", "cramped", "private room*",
    ],
    action: "Inspect facility upkeep (cleanliness, comfort rooms, air-conditioning, parking) at the flagged sites.",
  },
  {
    key: "appointments",
    label: "Appointments / Contact",
    kind: "issue",
    keywords: [
      "appointment*", "schedul*", "sched", "booking*", "book", "booked", "slot*", "online", "phone*", "call", "calling",
      "calls", "trunkline*", "hotline*", "line is busy", "line was busy", "busy line", "no one answer*", "not answering",
      "answer the phone", "unanswered", "sumasagot", "sumagot", "tumatawag", "tawag*", "viber", "messenger", "email*",
      "no response", "unresponsive", "not responding",
    ],
    action: "Strengthen appointment handling and phone/Viber responsiveness; add reminders and call-back coverage.",
  },
  {
    key: "diagnostics",
    label: "Diagnostics / Pharmacy",
    kind: "issue",
    keywords: [
      "lab", "labs", "laboratory", "laboratories", "xray", "x-ray", "x ray", "ultrasound*", "ultra sound", "ecg", "ekg",
      "ct scan", "mri", "2d echo", "result", "results", "resulta", "radiology", "imaging", "cbc", "urinalysis",
      "blood test*", "pharmacy", "medicine*", "medication*", "gamot", "botika", "prescription*", "prescribed",
    ],
    action: "Check result turnaround times and pharmacy availability; communicate expected release times.",
  },
  {
    key: "commendations",
    label: "Positive Commendations",
    kind: "commendation",
    keywords: [
      "thank*", "salamat", "recommend*", "excellent", "outstanding", "best", "kudos", "commend*", "galing", "magaling",
      "appreciate*", "grateful", "god bless", "godbless", "amazing", "great job", "more power", "keep it up", "highly",
    ],
    action: "Share commendations with the teams named and keep them as service standards.",
  },
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function alternatives(keywords: string[]): string {
  return keywords
    .map((k) => {
      const prefix = k.endsWith("*");
      const body = escape((prefix ? k.slice(0, -1) : k).toLowerCase()).replace(/ +/g, "\\s+");
      return prefix ? `${body}[[:alnum:]]*` : body;
    })
    .join("|");
}

/** PostgreSQL case-insensitive (`~*`) pattern with word boundaries. */
export function themeSqlPattern(theme: ThemeDef): string {
  return `\\m(${alternatives(theme.keywords)})\\M`;
}

/** Keyword list (syntax above) as a JavaScript regex with word boundaries; "g" finds every match with its position. */
export function keywordRegex(keywords: string[], flags = "iu"): RegExp {
  const alts = alternatives(keywords).replace(/\[\[:alnum:\]\]/g, "[\\p{L}\\p{N}]");
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts})(?![\\p{L}\\p{N}])`, flags);
}

/** The same matching as themeSqlPattern, in JavaScript (sentiment, tests). */
export function themeJsRegex(theme: ThemeDef, flags = "iu"): RegExp {
  return keywordRegex(theme.keywords, flags);
}

export const themeByKey = new Map(THEMES.map((t) => [t.key, t]));
