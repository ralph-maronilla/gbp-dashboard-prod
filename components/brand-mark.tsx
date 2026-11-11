import Box from "@mui/material/Box";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import { BRAND } from "@/lib/design-tokens";

/** The app's logo: a star on a rounded orange square. */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <Box aria-hidden sx={{ width: size, height: size, borderRadius: size > 32 ? 2 : 1, bgcolor: BRAND.orange, display: "grid", placeItems: "center", flexShrink: 0 }}>
      <StarRoundedIcon sx={{ fontSize: size * 0.7, color: BRAND.navy }} />
    </Box>
  );
}
