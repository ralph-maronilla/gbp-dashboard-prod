import { describe, expect, it } from "vitest";
import { classifyReview } from "./sentiment";
import { THEMES, THEME_KEYS, keywordRegex, themeByKey, themeJsRegex } from "./themes";

describe("themes", () => {
  it("defines every theme key once", () => {
    expect(THEMES.map((t) => t.key)).toEqual([...THEME_KEYS]);
    expect(themeByKey.size).toBe(THEME_KEYS.length);
  });
});

describe("keywordRegex", () => {
  it("matches whole words only", () => {
    expect(keywordRegex(["doc"]).test("the doc was kind")).toBe(true);
    expect(keywordRegex(["doc"]).test("a document")).toBe(false);
  });
  it("treats a trailing * as any ending", () => {
    const re = keywordRegex(["wait*"]);
    for (const w of ["wait", "waited", "waiting"]) expect(re.test(`I ${w} long`)).toBe(true);
    expect(re.test("awaiting")).toBe(false);
  });
  it("lets a space match several spaces and ignores case", () => {
    expect(keywordRegex(["long line"]).test("a LONG   line today")).toBe(true);
  });
});

describe("theme detection", () => {
  it("finds the waiting theme in English and Tagalog", () => {
    const re = themeJsRegex(themeByKey.get("waiting")!);
    expect(re.test("We waited two hours")).toBe(true);
    expect(re.test("Ang tagal ng pila")).toBe(true);
    expect(re.test("Lovely building")).toBe(false);
  });
});

describe("classifyReview", () => {
  it("returns nothing when no theme is mentioned", () => {
    expect(classifyReview("ok", 5).size).toBe(0);
  });
  it("falls back to the stars for a plain mention", () => {
    expect(classifyReview("The waiting area", 1).get("waiting")?.sentiment).toBe("negative");
    expect(classifyReview("The waiting area", 5).get("waiting")?.sentiment).toBe("positive");
    expect(classifyReview("The waiting area", 3).get("waiting")?.sentiment).toBe("mixed");
  });
});
