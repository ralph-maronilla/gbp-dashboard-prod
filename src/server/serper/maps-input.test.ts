import { describe, expect, it } from "vitest";
import { isShortMapsLink, looksLikePlaceId, parseMapsInput } from "./maps-input";

const FEATURE_CID = BigInt("0x810dcf4ed6dc25ca").toString();

describe("parseMapsInput", () => {
  it("accepts a bare CID and drops leading zeros", () => {
    expect(parseMapsInput(" 9299316743109092810 ")).toEqual({ cid: "9299316743109092810", name: null });
    expect(parseMapsInput("09299316743109092810")?.cid).toBe("9299316743109092810");
  });
  it("reads cid and ludocid query parameters", () => {
    expect(parseMapsInput("https://maps.google.com/?cid=9299316743109092810")?.cid).toBe("9299316743109092810");
    expect(parseMapsInput("https://www.google.com/search?q=x&ludocid=9299316743109092810")?.cid).toBe("9299316743109092810");
  });
  it("reads the feature id of a place link and the place name", () => {
    const url = "https://www.google.com/maps/place/Healthway+Cancer+Care/@14.55,121.02,17z/data=!4m6!3m5!1s0x3397b6e29464e389:0x810dcf4ed6dc25ca!8m2";
    expect(parseMapsInput(url)).toEqual({ cid: FEATURE_CID, name: "Healthway Cancer Care" });
  });
  it("gives the same CID for every link style of one place", () => {
    const a = parseMapsInput(FEATURE_CID)?.cid;
    const b = parseMapsInput(`https://maps.google.com/?cid=${FEATURE_CID}`)?.cid;
    expect(a).toBe(b);
  });
  it("rejects empty text, plain words and place ids", () => {
    expect(parseMapsInput("")).toBeNull();
    expect(parseMapsInput("   ")).toBeNull();
    expect(parseMapsInput("hello")).toBeNull();
    expect(parseMapsInput("ChIJN1t_tDeuEmsRUsoyG83frY4")).toBeNull();
    expect(parseMapsInput("https://example.com/no-place-here")).toBeNull();
  });
});

describe("looksLikePlaceId", () => {
  it("recognises pasted place ids", () => {
    expect(looksLikePlaceId("ChIJN1t_tDeuEmsRUsoyG83frY4")).toBe(true);
    expect(looksLikePlaceId("place_id:ChIJN1t_tDeuEmsRUsoyG83frY4")).toBe(true);
    expect(looksLikePlaceId("https://x.test/?query_place_id=ChIJN1t_tDeuEmsRUsoyG83frY4")).toBe(true);
  });
  it("does not flag a CID or a link", () => {
    expect(looksLikePlaceId("9299316743109092810")).toBe(false);
    expect(looksLikePlaceId("https://maps.google.com/?cid=1")).toBe(false);
  });
});

describe("isShortMapsLink", () => {
  it("matches the short link hosts only", () => {
    expect(isShortMapsLink("https://maps.app.goo.gl/abc123")).toBe(true);
    expect(isShortMapsLink("https://goo.gl/maps/abc")).toBe(true);
    expect(isShortMapsLink("https://www.google.com/maps/place/x")).toBe(false);
    expect(isShortMapsLink("not a url")).toBe(false);
  });
});
