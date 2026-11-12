"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import AppBar from "@mui/material/AppBar";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Container from "@mui/material/Container";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import MenuIcon from "@mui/icons-material/Menu";
import { BrandMark } from "@/components/brand-mark";
import { Sidebar } from "@/components/sidebar";
import { Tour } from "@/components/tour/tour";
import { useTourStore } from "@/lib/store/tour-store";
import { useHeartbeat, useIdleLogout, useLogout, useMe } from "@/lib/client/hooks";
import { useUiStore } from "@/lib/store/ui-store";

export default function AppLayout({ children }: { children: ReactNode }) {
  const me = useMe();
  useHeartbeat();
  const idle = useIdleLogout();
  const logout = useLogout();
  const mode = useUiStore((s) => s.themeMode);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isDesktop = useMediaQuery(useTheme().breakpoints.up("md"));
  // The tour opens the sidebar while one of its steps points at it.
  const tourTarget = useTourStore((s) => s.target);
  const tourSidebar = tourTarget === "nav" || tourTarget === "nav-users" || tourTarget === "guide";

  return (
    <Box sx={{ minHeight: "100dvh" }}>
      <AppBar
        position="fixed"
        color="default"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: "divider", zIndex: (t) => t.zIndex.drawer + 1 }}
      >
        <Toolbar variant="dense" sx={{ gap: 1, minHeight: 56 }}>
          <IconButton
            aria-label="Toggle navigation"
            edge="start"
            color="inherit"
            // Same button: collapse/expand on desktop (remembered), slide-out on mobile.
            onClick={() => (isDesktop ? setSidebarOpen(!sidebarOpen) : setMobileOpen((o) => !o))}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" component={Link} href="/" sx={{ color: "inherit", textDecoration: "none", fontSize: "0.9375rem", letterSpacing: "-0.005em", display: "flex", alignItems: "center", gap: 1 }}>
            <BrandMark />
            Review Dashboard
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          {me.data && (
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", display: { xs: "none", sm: "flex" } }}>
              <Box sx={{ textAlign: "right" }}>
                <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.2 }}>
                  {me.data.email}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {me.data.role}
                </Typography>
              </Box>
              <Avatar sx={{ width: 32, height: 32, bgcolor: "primary.main", color: "primary.contrastText", fontSize: "0.8rem", fontWeight: 600 }}>
                {me.data.email[0]?.toUpperCase()}
              </Avatar>
            </Stack>
          )}
          <IconButton onClick={toggleTheme} aria-label="Toggle light/dark theme" color="inherit">
            {mode === "light" ? <DarkModeIcon /> : <LightModeIcon />}
          </IconButton>
          <Button color="inherit" onClick={() => logout.mutate()} disabled={logout.isPending}>
            Sign out
          </Button>
        </Toolbar>
      </AppBar>

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

      <Box sx={{ display: "flex" }}>
        <Sidebar
          role={me.data?.role}
          desktopOpen={sidebarOpen || tourSidebar}
          mobileOpen={mobileOpen || (!isDesktop && tourSidebar)}
          trapFocus={!tourSidebar}
          onMobileClose={() => setMobileOpen(false)}
        />
        <Box component="main" sx={{ flexGrow: 1, minWidth: 0 }}>
          <Toolbar />
          <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
            {children}
          </Container>
        </Box>
      </Box>
      <Tour />
    </Box>
  );
}
