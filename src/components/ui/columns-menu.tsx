"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import type { SxProps, Theme } from "@mui/material/styles";
import ViewColumnOutlinedIcon from "@mui/icons-material/ViewColumnOutlined";

/** "Columns" button with a checklist of a table's columns; `hidden` holds the fields that are switched off. */
export function ColumnsMenu({
  columns,
  hidden,
  onToggle,
  iconOnly = false,
  sx,
}: {
  columns: { field: string; headerName?: string }[];
  hidden: Set<string>;
  onToggle: (field: string) => void;
  /** A square icon button (named "Columns" for screen readers) instead of the labelled one, where space is tight. */
  iconOnly?: boolean;
  sx?: SxProps<Theme>;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      {iconOnly ? (
        <Tooltip title="Columns">
          <IconButton aria-label="Columns" aria-haspopup="menu" onClick={(e) => setAnchor(e.currentTarget)} sx={[{ width: 44, height: 44, color: "brand.primaryText" }, ...(Array.isArray(sx) ? sx : [sx])]}>
            <ViewColumnOutlinedIcon />
          </IconButton>
        </Tooltip>
      ) : (
        <Button variant="outlined" startIcon={<ViewColumnOutlinedIcon />} onClick={(e) => setAnchor(e.currentTarget)} aria-haspopup="menu" sx={sx}>
          Columns
        </Button>
      )}
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {columns.map((c) => (
          <MenuItem key={c.field} dense onClick={() => onToggle(c.field)}>
            <Checkbox size="small" checked={!hidden.has(c.field)} sx={{ p: 0, mr: 1 }} tabIndex={-1} />
            <ListItemText primary={c.headerName} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
