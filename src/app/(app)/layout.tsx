"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import { BrandMark } from "@/components/brand-mark";
import { TopNav } from "@/components/top-nav";
import { Tour } from "@/components/tour/tour";
import { useHeartbeat, useIdleLogout, useLogout, useMe } from "@/lib/client/hooks";
import { useUiStore } from "@/lib/store/ui-store";

/** Page width: content and the top bar share one centered column. */
const PAGE = { maxWidth: 1360, mx: "auto", px: { xs: 2, sm: 4 } } as const;

export default function AppLayout({ children }: { children: ReactNode }) {
  const me = useMe();
  useHeartbeat();
  const idle = useIdleLogout();
  const logout = useLogout();
  const mode = useUiStore((s) => s.themeMode);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  return (
    <Box sx={{ minHeight: "100dvh" }}>
      <Box component="header" sx={{ position: "sticky", top: 0, zIndex: "appBar", bgcolor: "background.default", borderBottom: 1, borderColor: "divider" }}>
        {/* Brand, pages, account. Below the `lg` width the pages wrap onto their own row under the brand. */}
        <Box sx={{ ...PAGE, display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: { xs: 1, md: 4 }, minHeight: 64 }}>
          <Box component={Link} href="/" sx={{ display: "flex", alignItems: "center", gap: { xs: 1, sm: 1.5 }, minHeight: 64, textDecoration: "none", color: "brand.head", fontWeight: 600, fontSize: { xs: "1rem", sm: "1.0625rem" }, whiteSpace: "nowrap" }}>
            <BrandMark />
            Review Dashboard
          </Box>
          <TopNav role={me.data?.role} />
          <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 0.5, sm: 1.5 }, ml: "auto", minWidth: 0 }}>
            {me.data && (
              <Box sx={{ textAlign: "right", minWidth: 0, display: { xs: "none", sm: "block" } }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                  {me.data.full_name || me.data.email}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.3 }}>
                  {me.data.role}
                </Typography>
              </Box>
            )}
            <IconButton onClick={toggleTheme} aria-label="Toggle light/dark theme" color="inherit" sx={{ width: 44, height: 44 }}>
              {mode === "light" ? <DarkModeIcon /> : <LightModeIcon />}
            </IconButton>
            <Button variant="outlined" color="inherit" onClick={() => logout.mutate()} disabled={logout.isPending} sx={{ whiteSpace: "nowrap", px: { xs: 1.5, sm: 2.25 } }}>
              Sign out
            </Button>
          </Box>
        </Box>
      </Box>

      {/* Closing the dialog any way other than "Sign out now" counts as activity. */}
      <Dialog open={idle.warning} onClose={idle.stay} maxWidth="xs" fullWidth>
        <DialogTitle>Still there?</DialogTitle>
        <DialogContent>
          <Typography>You have been inactive for a while. You will be signed out in a few minutes to keep the data safe.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={idle.signOut}>Sign out now</Button>
          <Button variant="contained" onClick={idle.stay} autoFocus>
            Stay signed in
          </Button>
        </DialogActions>
      </Dialog>

      <Box component="main" sx={{ ...PAGE, py: { xs: 3, md: 5 } }}>
        {children}
      </Box>
      <Tour />
    </Box>
  );
}
