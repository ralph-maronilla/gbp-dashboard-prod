import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

/** Hairline between the panel's blocks. */
export function PanelDivider() {
  return <Box role="separator" sx={{ height: "1px", bgcolor: "brand.track" }} />;
}

/** Small heading of a panel block ("Credits today"). */
export function PanelLabel({ children }: { children: ReactNode }) {
  return (
    <Typography component="h3" sx={{ fontSize: 13, fontWeight: 600, color: "text.secondary" }}>
      {children}
    </Typography>
  );
}
