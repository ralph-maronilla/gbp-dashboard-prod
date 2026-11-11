"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Toolbar from "@mui/material/Toolbar";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import CloudDownloadOutlinedIcon from "@mui/icons-material/CloudDownloadOutlined";
import PeopleOutlinedIcon from "@mui/icons-material/PeopleOutlined";
import type { Role } from "@/lib/schemas/common";

export const SIDEBAR_WIDTH = 240;

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  roles?: Role[]; // omitted = every approved user
}

// Add new sections here; items are filtered by role.
const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/", icon: <DashboardOutlinedIcon /> },
  { label: "Dashboard", href: "/dashboard", icon: <InsightsOutlinedIcon /> },
  { label: "Extraction", href: "/extraction", icon: <CloudDownloadOutlinedIcon /> },
  { label: "Users", href: "/admin/users", icon: <PeopleOutlinedIcon />, roles: ["admin"] },
];

function NavList({ role, onNavigate }: { role?: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((i) => !i.roles || (role && i.roles.includes(role)));
  return (
    <List sx={{ px: 1.5, py: 2, display: "flex", flexDirection: "column", gap: 0.25 }}>
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <ListItemButton key={item.href} component={Link} href={item.href} selected={active} onClick={onNavigate}>
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontWeight: 500, fontSize: "0.875rem" } } }} />
          </ListItemButton>
        );
      })}
    </List>
  );
}

interface SidebarProps {
  role?: Role;
  /** Desktop: permanent drawer open/closed. */
  desktopOpen: boolean;
  /** Mobile: temporary drawer open/closed. */
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ role, desktopOpen, mobileOpen, onMobileClose }: SidebarProps) {
  return (
    <>
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        sx={{ display: { xs: "block", md: "none" }, "& .MuiDrawer-paper": { width: SIDEBAR_WIDTH } }}
      >
        <Toolbar />
        <NavList role={role} onNavigate={onMobileClose} />
      </Drawer>
      <Drawer
        variant="persistent"
        open={desktopOpen}
        sx={{
          display: { xs: "none", md: "block" },
          width: desktopOpen ? SIDEBAR_WIDTH : 0,
          flexShrink: 0,
          transition: (t) => t.transitions.create("width"),
          "& .MuiDrawer-paper": { width: SIDEBAR_WIDTH, boxSizing: "border-box" },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: "auto" }}>
          <NavList role={role} />
        </Box>
      </Drawer>
    </>
  );
}
