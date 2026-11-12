import Box from "@mui/material/Box";
import StarRoundedIcon from "@mui/icons-material/StarRounded";

/** The app's logo: a white star on a blue circle. */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <Box aria-hidden sx={{ width: size, height: size, borderRadius: "50%", bgcolor: "primary.main", display: "grid", placeItems: "center", flexShrink: 0 }}>
      <StarRoundedIcon sx={{ fontSize: size * 0.62, color: "primary.contrastText" }} />
    </Box>
  );
}
