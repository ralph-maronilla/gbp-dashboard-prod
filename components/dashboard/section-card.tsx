import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { LabelWithTip } from "./info-tip";

/** Bordered card with an ink heading, the guide's building block. `info` adds an ⓘ explaining the card. */
export function SectionCard({ title, subtitle, info, children, action }: { title: string; subtitle?: string; info?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 2.5 }, height: "100%", minWidth: 0 }}>
      <Typography variant="h6" sx={{ fontSize: "0.9375rem", mb: subtitle ? 0.25 : 2, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }} component="h2">
        {info ? <LabelWithTip label={title} text={info} /> : <span>{title}</span>}
        {action}
      </Typography>
      {subtitle && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {subtitle}
        </Typography>
      )}
      {children}
    </Paper>
  );
}

/** Bulleted narrative (readout, highlights, actions). */
export function BulletList({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {items.map((t) => (
        <li key={t}>
          <Typography variant="body2" sx={{ mb: 1, lineHeight: 1.55 }}>
            {t}
          </Typography>
        </li>
      ))}
    </ul>
  );
}
