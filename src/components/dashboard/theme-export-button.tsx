"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import { ApiClientError } from "@/lib/client/api-client";
import { useExportThemes } from "@/lib/client/hooks";
import type { ThemeExportQuery } from "@/lib/schemas/insights";

/** "Export to Excel": the Review Intelligence workbook (Summary tab + one tab per location) for `params`. */
export function ThemeExportButton({ params, label = "Export to Excel" }: { params: Partial<ThemeExportQuery>; label?: string }) {
  const exp = useExportThemes();
  return (
    <>
      <Button size="small" variant="outlined" startIcon={<FileDownloadOutlinedIcon />} loading={exp.isPending} loadingPosition="start" onClick={() => exp.mutate(params)}>
        {label}
      </Button>
      <Snackbar open={exp.isError} autoHideDuration={8000} onClose={() => exp.reset()} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity="error" onClose={() => exp.reset()} variant="filled">
          {exp.error instanceof ApiClientError ? exp.error.message : "Export failed. Try again."}
        </Alert>
      </Snackbar>
    </>
  );
}
