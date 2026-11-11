import Link from "next/link";
import Box from "@mui/material/Box";
import MuiLink from "@mui/material/Link";
import Rating from "@mui/material/Rating";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { formatDate } from "@/lib/format";
import type { DashboardLowReview } from "@/lib/schemas/dashboard";

export function LowRatingList({ rows }: { rows: DashboardLowReview[] }) {
  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No 1-2 star reviews in this range.
      </Typography>
    );
  }
  return (
    <Stack spacing={1.5} divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
      {rows.map((r) => (
        <Box key={r.id}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <Rating value={r.rating} readOnly size="small" />
            <MuiLink component={Link} href={`/locations/${r.location_id}`} underline="hover" variant="body2" sx={{ fontWeight: 500 }}>
              {r.location}
            </MuiLink>
            <Typography variant="caption" color="text.secondary">
              {formatDate(r.created_at)}
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {r.comment ?? "(rating only, no comment)"}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}
