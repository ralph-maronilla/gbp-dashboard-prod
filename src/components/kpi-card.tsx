import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { LabelWithTip } from "@/components/dashboard/info-tip";

export type KpiTone = "primary" | "success" | "warning" | "error" | "info";

/** Auto-fitting row of KPI cards. */
export const KPI_GRID_SX = { display: "grid", gap: 2, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" } as const;

/** Label, big value and optional icon / ⓘ explanation; `change` (e.g. a VsChange) goes under the value. */
export function KpiCard({ label, value, tone = "primary", icon, info, change }: { label: string; value: string; tone?: KpiTone; icon?: ReactNode; info?: string; change?: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, height: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Typography variant="caption" color="text.secondary" component="div">
          {info ? <LabelWithTip label={label} text={info} /> : label}
        </Typography>
        {icon && (
          <Box aria-hidden sx={{ display: "flex", color: "primary.main", "& svg": { fontSize: 18 } }}>
            {icon}
          </Box>
        )}
      </Box>
      <Typography variant="h4" sx={{ lineHeight: 1.2, mt: 1 }} color={tone === "primary" ? "text.primary" : `${tone}.main`}>
        {value}
      </Typography>
      {change}
    </Paper>
  );
}
