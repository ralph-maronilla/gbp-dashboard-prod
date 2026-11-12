"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Box from "@mui/material/Box";
import type { Role } from "@/lib/schemas/common";

interface NavItem {
  label: string;
  href: string;
  roles?: Role[]; // omitted = every approved user
  /** `data-tour` id the guided tour points at. */
  tour?: string;
}

// Add new sections here; items are filtered by role.
const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Extraction", href: "/extraction" },
  { label: "Users", href: "/admin/users", roles: ["admin"], tour: "nav-users" },
  { label: "User guide", href: "/guide", tour: "guide" },
];

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  return (
    <Box
      component={Link}
      href={item.href}
      aria-current={active ? "page" : undefined}
      data-tour={item.tour}
      sx={{
        display: "flex",
        alignItems: "center",
        height: { xs: 48, md: 64 },
        // The 3px underline is always there (transparent when inactive) so the label does not shift.
        borderBottom: "3px solid transparent",
        borderTop: "3px solid transparent",
        color: "text.secondary",
        fontWeight: 500,
        fontSize: { xs: "0.875rem", sm: "0.9375rem" },
        textDecoration: "none",
        whiteSpace: "nowrap",
        "&:hover": { color: "text.primary" },
        "&:focus-visible": { outline: (t) => `2px solid ${t.palette.brand.primaryText}`, outlineOffset: -2, borderRadius: 1 },
        "&[aria-current='page']": { color: "brand.head", fontWeight: 600, borderBottomColor: "brand.teal" },
      }}
    >
      {item.label}
    </Box>
  );
}

/** The pages, as links in the top bar. Wraps onto its own row under the brand on narrow screens. */
export function TopNav({ role }: { role?: Role }) {
  const items = NAV_ITEMS.filter((i) => !i.roles || (role && i.roles.includes(role)));
  return (
    <Box
      component="nav"
      aria-label="Pages"
      data-tour="nav"
      sx={{ display: "flex", flexWrap: "wrap", columnGap: { xs: 1.75, sm: 2.5, md: 3.5 }, order: { xs: 3, lg: 0 }, flexBasis: { xs: "100%", lg: "auto" } }}
    >
      {items.map((item) => (
        <NavLink key={item.href} item={item} />
      ))}
    </Box>
  );
}
