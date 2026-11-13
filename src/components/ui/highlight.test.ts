import { describe, expect, it } from "vitest";
import { splitMatches } from "./highlight";

const marked = (text: string, term: string) => splitMatches(text, term).map((p) => (p.match ? `[${p.text}]` : p.text)).join("");

describe("splitMatches", () => {
  it("returns the text unmarked for an empty or blank term", () => {
    expect(splitMatches("Friendly staff", "")).toEqual([{ text: "Friendly staff", match: false }]);
    expect(splitMatches("Friendly staff", "   ")).toEqual([{ text: "Friendly staff", match: false }]);
  });

  it("returns nothing for empty text", () => {
    expect(splitMatches("", "staff")).toEqual([]);
  });

  it("returns the text unmarked when the term is not in it", () => {
    expect(splitMatches("Friendly staff", "doctor")).toEqual([{ text: "Friendly staff", match: false }]);
  });

  it("marks every occurrence, ignoring case, and keeps the original casing", () => {
    expect(marked("Staff were kind. Great STAFF, staff!", "staff")).toBe("[Staff] were kind. Great [STAFF], [staff]!");
  });

  it("marks a match at the start and at the end", () => {
    expect(marked("wait", "wait")).toBe("[wait]");
    expect(marked("long wait", "wait")).toBe("long [wait]");
  });

  it("matches the whole phrase, trimmed, not its words", () => {
    expect(marked("long waiting time, long time", " waiting time ")).toBe("long [waiting time], long time");
  });

  it("treats regex characters as plain text", () => {
    expect(marked("Cost (PHP) was 1.500", "(php)")).toBe("Cost [(PHP)] was 1.500");
    expect(marked("a.b axb", "a.b")).toBe("[a.b] axb");
  });
});
