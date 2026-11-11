/**
 * How each theme mention feels, read from the review text (offline word lists, English and Tagalog/Taglish), as the
 * Healthway sample dashboard asks: "use actual review text to calculate these percentages".
 *
 * 1. The review is cut into clauses at sentence ends and contrast words ("but", "pero", "kaso"...), so "great doctor
 *    but we waited 3 hours" judges Doctors and Waiting Time separately.
 * 2. In each clause, every opinion word (POSITIVE / NEGATIVE, phrases first) counts for the nearest theme keyword.
 *    "not", "hindi", "wala"... up to 3 words before it flip it ("not friendly", "hindi matagal", "do not recommend").
 * 3. A theme with only positive words is positive, only negative words negative, both mixed. With no opinion word
 *    about it, the review's stars decide (4-5 positive, 3 mixed, 1-2 negative) and the mention is counted as such.
 *
 * Deterministic: the same text always gives the same result. To tune it, edit the word lists (keyword syntax of
 * ./themes.ts) and bump SENTIMENT_VERSION.
 */
import { keywordRegex, THEMES, type ThemeKey } from "./themes";

export const SENTIMENT_VERSION = 3;

export type Sentiment = "positive" | "mixed" | "negative";
export interface ThemeSentiment {
  sentiment: Sentiment;
  /** True when opinion words decided it; false when the stars did (no opinion word about this theme). */
  fromText: boolean;
}

export const POSITIVE = [
  // English
  "good", "goood", "very good", "great", "excellent", "outstanding", "amazing", "awesome", "wonderful", "fantastic", "superb",
  "perfect", "exceptional", "impressive", "impressed", "top notch", "topnotch", "best", "nice", "kind", "kindness",
  "friendly", "polite", "courteous", "respectful", "helpful", "accommodating", "accomodating", "approachable", "attentive",
  "caring", "gentle", "warm", "welcoming", "hospitable", "smiling", "smile*", "professional", "knowledgeable", "competent",
  "thorough", "efficient", "organized", "organised", "smooth*", "fast", "faster", "quick*", "prompt*", "immediate*",
  "on time", "no wait*", "short wait*", "in and out", "clean", "spotless", "comfortable", "comfy", "cozy", "spacious",
  "affordable", "reasonable", "cheap", "worth*", "satisfied", "satisfying", "happy", "glad", "pleased", "love", "loved",
  "lovely", "recommend*", "thank*", "thanks", "thx", "ty", "appreciate*", "grateful", "kudos", "commend*", "god bless",
  "godbless", "more power", "keep it up", "keep up the good work", "thumbs up", "5 stars", "five stars",
  "well done", "great job", "good job", "convenient", "easy", "hassle free", "hassle-free", "responsive", "reliable",
  "safe", "clear", "fair", "legit", "less stress*", "stress free", "stress-free", "bearable",
  "remarkable", "phenomenal", "incredible", "pleasant", "pleasantly", "beautiful", "sweet", "excellence",
  "very patient", "so patient", "compassion*", "sincere", "genuine*", "dedicat*",
  "diligent", "thoughtful", "kind hearted", "kindhearted", "humble", "cheerful", "jolly", "calm*", "reassur*",
  "comforting", "supportive", "hospitality", "professionalism", "skilled", "skillful", "well trained",
  "trustworthy", "speedy", "swift", "seamless", "orderly", "systematic",
  "well managed", "well maintained", "well equipped", "state of the art", "modern", "neat", "tidy", "hygienic", "relaxing", "inexpensive", "value for money", "satisfactory", "informative", "answered all",
  "explained everything", "explained clearly", "explained well", "clearly explained", "took care", "taken care",
  "taking care", "well cared", "cared for", "above and beyond", "extra mile", "exceeded expectations", "at ease",
  "feel at home", "felt at home", "quality care", "quality service", "high quality", "blessed", "thankful", "gratitude",
  "heartfelt", "salute", "hats off",
  // Tagalog / Taglish
  "salamat", "maraming salamat", "galing", "magaling", "mahusay", "mabait", "bait", "sobrang bait", "mabilis", "bilis",
  "malinis", "maayos", "ayos", "maganda", "ganda", "masaya", "matulungin", "magalang", "maasikaso", "asikaso",
  "inalagaan", "alaga", "mura", "sulit", "walang pila", "di na naghintay",
  "mababait", "babait", "napakabait", "magagaling", "napakagaling", "maalaga", "mapagpasensya", "matiyaga", "magiliw",
  "napakabilis", "napakalinis", "maaliwalas", "komportable", "kumportable", "abot kaya", "abot-kaya", "nakakatuwa",
  "pasasalamat", "nagpapasalamat", "magandang",
  // Bisaya / Hiligaynon, common in the Visayas and Mindanao branches
  "maayo", "nindot", "dasig", "salamat kaayo", "buotan", "limpyo", "paspas",
];

export const NEGATIVE = [
  // English
  "bad", "worst", "worse", "terrible", "horrible", "awful", "lousy", "poor*", "disappoint*", "dismay*", "frustrat*",
  "annoy*", "angry", "upset", "unhappy", "dissatisfied", "unsatisfied", "sad", "sadly", "unfortunately", "nightmare",
  "rude*", "unprofessional", "arrogant", "snob*", "impolite", "disrespect*", "grumpy", "unfriendly", "unhelpful",
  "unaccommodating", "insensitive", "inconsiderate", "careless", "incompetent", "negligen*", "toxic", "sloppy",
  "slow", "slower", "slowest", "slowness", "very slowly", "so slowly", "too slowly", "delay*", "late", "too long", "so long", "very long", "long wait*", "long line*", "long queue*",
  "for hours", "took hours", "waste*", "dirty", "unclean", "unsanitary", "smelly", "stinky", "crowded", "cramped",
  "expensive", "overpriced", "overcharg*", "pricey", "scam*", "unresponsive", "no response", "not responding",
  "no one answer*", "nobody answer*", "not answering", "unanswered", "cannot be reached", "can't be reached",
  "unreachable", "busy line", "line is busy", "ignored", "ignoring", "wrong", "mistake*", "misdiagnos*", "confus*",
  "chaotic", "disorganized", "disorganised", "mess", "messy", "hassle", "complain*", "problem*", "stress*",
  "never again", "avoid", "do not go", "don't go", "unavailable", "out of stock", "cancelled", "canceled", "refused",
  "denied", "lack of", "lacking", "not worth", "pricy", "over pric*", "hidden charge*", "deceptive", "shock*",
  "inconvenien*", "unsafe", "dismissive", "unwelcoming", "racist", "useless", "unorganized", "unorganised", "dilapidated",
  "pressuring", "pressured", "not working", "doesn't work", "does not work", "didn't work", "don't work", "won't work", "broken",
  "no one", "nobody", "only to", "still waiting", "still no", "no update*", "never called", "no answer",
  "kept waiting", "made us wait", "made me wait", "had to wait", "takes forever", "took forever", "unacceptable",
  "ridiculous", "pathetic", "disgust*", "appalling", "horrendous", "atrocious", "inefficient", "incompetence",
  "unreliable", "neglect*", "irresponsible", "uncaring", "indifferent", "condescending", "hostile", "impatient", "unfair",
  "unjust", "discriminat*", "ignore", "ignores", "lazy", "noisy", "stuffy", "outdated", "filthy", "cockroach*",
  "unattended", "not attended", "not entertained", "no assistance", "yell*", "understaffed", "lack", "lacks", "lacked",
  "irritat*", "inconsistent", "incorrect", "inaccurate", "error*", "misplaced", "failed to", "embarrass*", "humiliat*",
  "sorry to say", "beware", "think twice", "stay away", "unbearable",
  // Tagalog / Taglish
  "masungit", "sungit", "suplada", "suplado", "bastos", "pangit", "panget", "walang modo", "walang respeto",
  "mabagal", "bagal", "matagal", "tagal", "katagal", "ang tagal", "ang haba", "sayang*", "marumi", "madumi", "mabaho",
  "baho", "mainit", "ang mahal", "sobrang mahal", "napakamahal", "nakakainis", "inis", "galit", "nakakadismaya",
  "pabaya", "walang kwenta", "walang kuwenta", "kulang", "walang stock", "wag kayo", "huwag kayo", "mataray", "taray",
  "maldita", "walang pakialam", "dedma", "sira",
  "masusungit", "pabalang", "tamad", "chismis*", "pinaghintay", "gulo", "magulo", "palpak", "sablay", "napabayaan",
  "walang alam", "walang malasakit", "walang sumasagot", "hindi sumasagot", "di sumasagot", "walang sagot",
  "walang update", "wala pa rin", "hindi pa rin", "nakakairita", "bwisit", "buwisit", "nakakabwisit", "nakakapikon",
  "nakakahiya", "dismayado", "nakakalungkot", "ang dumi", "dumi", "kadiri", "nakakadiri", "mapanghi", "masikip",
  "siksikan", "niloko", "budol", "pahirap", "ang hirap", "kawawa", "masyadong mahal", "medyo mahal",
  // Bisaya
  "dugay", "samok", "hugaw", "maldito", "mahal kaayo",
];

/** Phrases that look like opinions but are not ("kind of slow", greetings); they hide the words inside them. */
export const NEUTRAL = [
  "kind of", "kinda", "what kind", "any kind", "all kinds", "good morning", "good afternoon", "good evening", "good day",
  "best regards", "thanks in advance", "thank you in advance", "no choice", "thank me later", "sana all",
  "magandang umaga", "magandang hapon", "magandang gabi", "magandang araw", "maayong buntag", "maayong hapon",
  "maayong gabii", "not only", "not just", "don't just", "do not just",
  // Not having to wait is no complaint.
  "didn't have to wait too long", "didn't wait too long", "didn't wait long", "didn't have to wait", "did not have to wait", "didn't wait", "did not wait", "no need to wait",
];

const POSITIVE_EMOJI = ["🥰", "😊", "😍", "❤️", "❤", "💕", "💖", "💙", "💚", "👍", "🙏", "😁", "😀", "😃", "😄", "🤗", "💯", "👏", "⭐", "🌟"];
const NEGATIVE_EMOJI = ["😡", "😠", "🤬", "👎", "😤", "😞", "😢", "😭", "💔", "🙄", "😒"];

/** Words that flip the polarity of an opinion word up to NEGATION_WINDOW words after them. */
const NEGATORS = new Set([
  "not", "no", "never", "hindi", "di", "'di", "wala", "walang", "dont", "don't", "didnt", "didn't", "doesnt", "doesn't",
  "isnt", "isn't", "wasnt", "wasn't", "arent", "aren't", "werent", "weren't", "wont", "won't", "cant", "can't", "cannot",
  "couldnt", "couldn't", "hardly", "without", "neither", "nor", "lack", "lacks", "lacked", "lacking", "nobody",
]);
const NEGATION_WINDOW = 3;
/** "wala" / "walang" reach further: "wala naman kaming na-experience na rude things". */
const WALA_WINDOW = 8;
/**
 * A wish or a "used to" turns praise into a complaint: "staff should be polite", "sana maayos", "I hope they improve",
 * "they used to be fast". Applies to positive words only, within WISH_WINDOW words.
 */
const WISHES = keywordRegex(
  // "hope" only as a verb: Hope is also a nurse's name ("Nurse Hope is very accommodating").
  ["should", "sana", "i hope", "we hope", "hope they", "hope you", "hope that", "hoping", "hopefully", "need to",
    "needs to", "must", "dapat", "remind", "used to"],
  "giu",
);
/** "I must say they are friendly" is praise, not a wish. */
const NOT_WISH = /^\s+say\b/i;
const WISH_WINDOW = 4;
/** "we need to have a seamless visit" is a need of their own, not a wish about the staff. */
const PERSONAL = /(?:^|\s)(?:i|we)\s*$/i;
/** "cannot recommend Sir David enough" is praise: rewritten before the words are read. */
const CANNOT_ENOUGH = /\b(?:cannot|can't|cant|can not)\s+((?:recommend|thank|praise|appreciate)\w*)([^.!?\n]{0,40}?)\s+enough/giu;
/** "without" reaches further: "without the hassle of a long wait". */
const WITHOUT_WINDOW = 6;

/** Waiting Time only: a stated duration in hours ("2 hours", "an hour", "ilang oras") reads as a long wait. */
const DURATION = /(?<![\p{L}\p{N}])(?:\d+(?:\.\d+)?|an?|one|two|three|four|five|six|several|many|ilang|isang)\s*\+?\s*(?:hours?|hrs?|oras)(?![\p{L}\p{N}])/giu;

/** Clause boundaries: sentence ends, semicolons, new lines and contrast words. */
const CLAUSE_SPLIT = /[.!?;\n]+|\s(?:but|pero|kaso|however|although|though|except|kaya lang|kaya nga lang|unfortunately|sadly)(?![\p{L}\p{N}])/giu;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const emojiRegex = (list: string[]) => new RegExp(list.map(escape).join("|"), "gu");
const POS_RE = keywordRegex(POSITIVE, "giu");
const NEG_RE = keywordRegex(NEGATIVE, "giu");
const NEUTRAL_RE = keywordRegex(NEUTRAL, "giu");
const POS_EMOJI_RE = emojiRegex(POSITIVE_EMOJI);
const NEG_EMOJI_RE = emojiRegex(NEGATIVE_EMOJI);
const THEME_RES = THEMES.map((t) => ({ key: t.key, re: keywordRegex(t.keywords, "giu") }));
const TOKEN = /[\p{L}\p{N}']+/gu;

interface Span {
  start: number;
  end: number;
}
interface Opinion extends Span {
  /** Emoji are never negated ("not recommended 👎" stays negative). */
  emoji?: boolean;
  /** 0 = neutral phrase: only hides the words inside it. */
  polarity: 1 | -1 | 0;
  /** Only counts for this theme (theme-specific cue). */
  only?: ThemeKey;
}

const matches = (re: RegExp, text: string): Span[] => [...text.matchAll(re)].map((m) => ({ start: m.index!, end: m.index! + m[0].length }));

/** Opinion words of one clause, longest first when they overlap ("sobrang bait" over "bait"), negation applied. */
function opinions(clause: string): Opinion[] {
  const found: Opinion[] = [
    ...matches(NEUTRAL_RE, clause).map((s) => ({ ...s, polarity: 0 as const })),
    ...matches(POS_RE, clause).map((s) => ({ ...s, polarity: 1 as const })),
    ...matches(NEG_RE, clause).map((s) => ({ ...s, polarity: -1 as const })),
    ...matches(POS_EMOJI_RE, clause).map((s) => ({ ...s, polarity: 1 as const, emoji: true })),
    ...matches(NEG_EMOJI_RE, clause).map((s) => ({ ...s, polarity: -1 as const, emoji: true })),
    ...matches(DURATION, clause).map((s) => ({ ...s, polarity: -1 as const, only: "waiting" as const })),
  ].sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const kept: Opinion[] = [];
  for (const o of found) if (!kept.some((k) => o.start < k.end && k.start < o.end)) kept.push(o);

  const tokens = [...clause.matchAll(TOKEN)].map((m) => ({ start: m.index!, word: m[0].toLowerCase() }));
  return kept
    .filter((o) => o.polarity !== 0)
    .map((o) => {
      if (o.emoji) return o;
      const before = tokens.filter((t) => t.start < o.start);
      // A negator within reach before the word, not itself part of a phrase ("no wait", "walang pila"), except a
      // negative phrase before praise ("lack of compassion", "no one was friendly"). It stops at an opinion word of the
      // other feeling ("without delays, making me feel at ease"), and words that are negators ("nobody") stay as they are.
      const self = tokens.find((t) => t.start === o.start)?.word;
      const negated = !NEGATORS.has(self ?? "") && before.some((t, i) => {
        const reach = t.word === "without" ? WITHOUT_WINDOW : t.word === "wala" || t.word === "walang" ? WALA_WINDOW : NEGATION_WINDOW;
        if (before.length - i > reach || !NEGATORS.has(t.word)) return false;
        if (kept.some((k) => k.polarity !== 0 && k.polarity !== o.polarity && k.start > t.start && k.end <= o.start)) return false;
        return !kept.some((k) => t.start >= k.start && t.start < k.end && !(k.polarity < 0 && o.polarity > 0));
      });
      if (negated) return { ...o, polarity: (-o.polarity) as 1 | -1 };
      const wished =
        o.polarity > 0 &&
        matches(WISHES, clause).some((w) => w.end <= o.start && !NOT_WISH.test(clause.slice(w.end)) && !PERSONAL.test(clause.slice(0, w.start)) && tokens.filter((t) => t.start >= w.end && t.start < o.start).length < WISH_WINDOW);
      return wished ? { ...o, polarity: -1 as const } : o;
    });
}

const starSentiment = (rating: number): Sentiment => (rating >= 4 ? "positive" : rating === 3 ? "mixed" : "negative");

/**
 * Feeling from the counts of positive and negative opinion words about a theme. Both kinds make it mixed, unless one
 * side clearly outnumbers the other and the stars agree with it (a 1-2★ review with more complaints than praise).
 */
function wordsSentiment(pos: number, neg: number, rating: number): Sentiment {
  if (pos === 0) return "negative";
  if (neg === 0) return "positive";
  if (neg > pos && rating <= 2) return "negative";
  if (pos > neg && rating >= 4) return "positive";
  return "mixed";
}

/**
 * Sentiment of every theme the review mentions (the same detection as themeSqlPattern / themeJsRegex, so mention counts
 * are unchanged). Themes the review does not mention are absent from the result.
 */
export function classifyReview(comment: string, rating: number): Map<ThemeKey, ThemeSentiment> {
  const text = comment.replace(/[’‘]/g, "'").replace(CANNOT_ENOUGH, "highly $1$2");
  const score = new Map<ThemeKey, { pos: number; neg: number }>();
  const mentioned = new Set<ThemeKey>(THEME_RES.filter((t) => matches(t.re, text).length > 0).map((t) => t.key));

  for (const clause of text.split(CLAUSE_SPLIT)) {
    const mentions = THEME_RES.flatMap((t) => matches(t.re, clause).map((s) => ({ ...s, key: t.key })));
    if (mentions.length === 0) continue;
    for (const o of opinions(clause)) {
      const candidates = o.only ? mentions.filter((m) => m.key === o.only) : mentions;
      if (candidates.length === 0) continue;
      // Distance in characters between the opinion word and the theme keyword (0 when they overlap, e.g. "rude").
      const dist = (m: Span) => (m.end <= o.start ? o.start - m.end : o.end <= m.start ? m.start - o.end : 0);
      const best = Math.min(...candidates.map(dist));
      const targets = new Set(candidates.filter((m) => dist(m) === best).map((m) => m.key));
      // An opinion word that is itself a theme keyword ("mabait", "matagal") also describes a theme close by ("mabait na doctor").
      if (best === 0) for (const m of candidates) if (dist(m) > 0 && dist(m) <= 25) targets.add(m.key);
      for (const key of targets) {
        const s = score.get(key) ?? { pos: 0, neg: 0 };
        if (o.polarity > 0) s.pos++;
        else s.neg++;
        score.set(key, s);
      }
    }
  }

  const out = new Map<ThemeKey, ThemeSentiment>();
  for (const key of mentioned) {
    const s = score.get(key);
    if (!s || (s.pos === 0 && s.neg === 0)) out.set(key, { sentiment: starSentiment(rating), fromText: false });
    else out.set(key, { sentiment: wordsSentiment(s.pos, s.neg, rating), fromText: true });
  }
  return out;
}

const cache = new Map<string, Map<ThemeKey, ThemeSentiment>>();
const CACHE_LIMIT = 50_000;

/** classifyReview, remembered per review for this server instance (the key changes when the text or rating does). */
export function classifyCached(id: string, comment: string, rating: number): Map<ThemeKey, ThemeSentiment> {
  const key = `${SENTIMENT_VERSION}:${id}:${rating}:${comment.length}`;
  let hit = cache.get(key);
  if (!hit) {
    if (cache.size >= CACHE_LIMIT) cache.clear();
    hit = classifyReview(comment, rating);
    cache.set(key, hit);
  }
  return hit;
}
