import Box from "@mui/material/Box";
import { alpha } from "@mui/material/styles";

/**
 * `text` cut into pieces, alternating plain and matching `term` (whole phrase, any case: the way the reviews search
 * matches). An empty term gives the text back as one plain piece.
 */
export function splitMatches(text: string, term: string): { text: string; match: boolean }[] {
  const needle = term.trim().toLowerCase();
  if (!needle || !text) return text ? [{ text, match: false }] : [];
  const hay = text.toLowerCase();
  // Lower-casing can change a string's length for a few characters; then positions no longer line up, so do not mark.
  if (hay.length !== text.length) return [{ text, match: false }];
  const parts: { text: string; match: boolean }[] = [];
  let from = 0;
  for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), match: false });
    parts.push({ text: text.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts;
}

/** `text` with every occurrence of `term` marked (a teal tint; the text keeps its color). */
export function Highlight({ text, term }: { text: string; term: string }) {
  const parts = splitMatches(text, term);
  if (!parts.some((p) => p.match)) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) =>
        p.match ? (
          <Box component="mark" key={i} sx={{ color: "inherit", borderRadius: "3px", px: "1px", bgcolor: (t) => alpha(t.palette.brand.teal, t.palette.mode === "light" ? 0.28 : 0.4) }}>
            {p.text}
          </Box>
        ) : (
          p.text
        ),
      )}
    </>
  );
}
