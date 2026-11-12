"use client";

import Link from "next/link";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import InputAdornment from "@mui/material/InputAdornment";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import SearchIcon from "@mui/icons-material/Search";
import TourOutlinedIcon from "@mui/icons-material/TourOutlined";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { useMe } from "@/lib/client/hooks";
import { guideFor, rolesTag, searchGuide, type GuideBlock } from "@/lib/guide/sections";
import { useTourStore } from "@/lib/store/tour-store";

/** "Click **Apply**" → "Click <strong>Apply</strong>". */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  );
}

function RoleTag({ roles }: { roles: GuideBlock["roles"] }) {
  const tag = rolesTag(roles);
  return tag ? <Chip size="small" variant="outlined" color="secondary" label={tag} sx={{ ml: 1, verticalAlign: "middle" }} /> : null;
}

function Block({ block }: { block: GuideBlock }) {
  switch (block.kind) {
    case "h":
      return (
        <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, mt: 2.5, mb: 1 }}>
          {block.text}
          <RoleTag roles={block.roles} />
        </Typography>
      );
    case "p":
      return (
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          <Rich text={block.text} />
        </Typography>
      );
    case "note":
      return (
        <Alert severity="info" variant="outlined" sx={{ mb: 1.5 }}>
          <Rich text={block.text} />
        </Alert>
      );
    case "list":
    case "steps": {
      const Tag = block.kind === "steps" ? "ol" : "ul";
      return (
        <Box component={Tag} sx={{ pl: 3, my: 0, mb: 1.5, "& li": { mb: 0.75, typography: "body2" } }}>
          {block.items.map((item) => (
            <li key={item}>
              <Rich text={item} />
            </li>
          ))}
        </Box>
      );
    }
    case "table":
      return (
        <Box sx={{ overflowX: "auto", mb: 1.5 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {block.head.map((h) => (
                  <TableCell key={h} sx={{ fontWeight: 600 }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {block.rows.map((row) => (
                <TableRow key={row.join("|")}>
                  {row.map((cell, i) => (
                    <TableCell key={i}>
                      <Rich text={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      );
  }
}

/** User guide: how to use every page, filtered to what the signed-in user's role can do, with search and the tour. */
export default function GuidePage() {
  const me = useMe();
  const startTour = useTourStore((s) => s.start);
  const [query, setQuery] = useState("");
  const sections = useMemo(() => guideFor(me.data?.role), [me.data?.role]);
  const shown = useMemo(() => searchGuide(sections, query), [sections, query]);

  const toc: ReactNode = (
    <List dense aria-label="Guide contents" sx={{ py: 0 }}>
      {sections.map((s) => (
        <ListItemButton key={s.id} component="a" href={`#${s.id}`} disabled={!shown.includes(s)} sx={{ borderRadius: 1 }}>
          <ListItemText primary={s.title} />
        </ListItemButton>
      ))}
    </List>
  );

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { sm: "flex-start" } }}>
        <div>
          <Typography variant="h5" component="h1">
            User guide
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            How to use each page{me.data ? `, for your role (${me.data.role})` : ""}.
          </Typography>
        </div>
        <Button variant="contained" startIcon={<TourOutlinedIcon />} onClick={startTour}>
          Start the tour
        </Button>
      </Stack>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 3 }}>
          <Box sx={{ position: { md: "sticky" }, top: { md: 80 } }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Search the guide"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }, htmlInput: { "aria-label": "Search the guide" } }}
              sx={{ mb: 1.5 }}
            />
            <Paper variant="outlined" sx={{ p: 0.5 }}>
              {toc}
            </Paper>
          </Box>
        </Grid>

        <Grid size={{ xs: 12, md: 9 }}>
          <Stack spacing={2.5}>
            {query && (
              <Typography variant="body2" color="text.secondary" aria-live="polite">
                {shown.length === 0 ? `No section mentions “${query}”.` : `${shown.length} section${shown.length === 1 ? "" : "s"} mention “${query}”.`}
              </Typography>
            )}
            {shown.map((s) => (
              <Paper key={s.id} id={s.id} variant="outlined" sx={{ p: { xs: 2, md: 3 }, scrollMarginTop: 80 }}>
                <Typography variant="h6" component="h2">
                  {s.title}
                  <RoleTag roles={s.roles} />
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {s.summary}
                </Typography>
                {s.blocks.map((b, i) => (
                  <Block key={i} block={b} />
                ))}
                {s.goTo && (
                  <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                    {s.goTo.map((g) => (
                      <Button key={g.href} component={Link} href={g.href} size="small" endIcon={<ArrowForwardIcon />}>
                        {g.label}
                      </Button>
                    ))}
                  </Stack>
                )}
              </Paper>
            ))}
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  );
}
