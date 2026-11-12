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
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import Divider from "@mui/material/Divider";
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

const GUIDE: NavItem = { label: "User guide", href: "/guide", icon: <HelpOutlineOutlinedIcon /> };

function NavLink({ item, onNavigate, tour }: { item: NavItem; onNavigate?: () => void; tour?: string }) {
  const pathname = usePathname();
  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  return (
    <ListItemButton component={Link} href={item.href} selected={active} onClick={onNavigate} data-tour={tour}>
      <ListItemIcon>{item.icon}</ListItemIcon>
      <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontWeight: 500, fontSize: "0.875rem" } } }} />
    </ListItemButton>
  );
}

/** The pages, then the User guide at the bottom of the sidebar. */
function NavList({ role, onNavigate }: { role?: Role; onNavigate?: () => void }) {
  const items = NAV_ITEMS.filter((i) => !i.roles || (role && i.roles.includes(role)));
  return (
    <Box sx={{ display: "flex", flexDirection: "column", flexGrow: 1, minHeight: 0 }}>
      <List data-tour="nav" sx={{ px: 1.5, py: 2, display: "flex", flexDirection: "column", gap: 0.25 }}>
        {items.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} tour={item.href === "/admin/users" ? "nav-users" : undefined} />
        ))}
      </List>
      <Box sx={{ mt: "auto" }}>
        <Divider />
        <List sx={{ px: 1.5, py: 1.5 }}>
          <NavLink item={GUIDE} onNavigate={onNavigate} tour="guide" />
        </List>
      </Box>
    </Box>
  );
}

interface SidebarProps {
  role?: Role;
  /** Desktop: permanent drawer open/closed. */
  desktopOpen: boolean;
  /** Mobile: temporary drawer open/closed. */
  mobileOpen: boolean;
  onMobileClose: () => void;
  /** Phone drawer keeps keyboard focus inside it; off while the tour's card (outside the drawer) needs it. */
  trapFocus?: boolean;
}

export function Sidebar({ role, desktopOpen, mobileOpen, onMobileClose, trapFocus = true }: SidebarProps) {
  return (
    <>
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true, disableEnforceFocus: !trapFocus }}
        sx={{ display: { xs: "block", md: "none" }, "& .MuiDrawer-paper": { width: SIDEBAR_WIDTH, display: "flex", flexDirection: "column" } }}
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
        <Box sx={{ overflow: "auto", flexGrow: 1, display: "flex", flexDirection: "column" }}>
          <NavList role={role} />
        </Box>
      </Drawer>
    </>
  );
}
