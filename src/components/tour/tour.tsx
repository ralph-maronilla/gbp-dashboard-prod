"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Popper from "@mui/material/Popper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { useMe } from "@/lib/client/hooks";
import { readStored, writeStored } from "@/lib/client/stored";
import { tourStepsFor } from "@/lib/guide/tour-steps";
import { canExtract } from "@/lib/schemas/common";
import { useTourStore } from "@/lib/store/tour-store";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}
const PAD = 6;
/** How long a step waits for its element (a page loading) before it is skipped. */
const WAIT_MS = 4000;
const doneKey = (userId: string) => `tour-done:${userId}`;

/** The first element marked `data-tour=target` that is actually on screen (the sidebar exists twice: desktop and phone). */
function findTarget(target: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth) return el;
  }
  return null;
}

/**
 * The guided tour: dims the page, highlights one element per step (lib/guide/tour-steps.ts) and explains it in a card
 * with Back / Next / Skip. Opens the step's page when needed and skips steps whose element is not there. Starts by
 * itself once per user in this browser (on a computer-sized screen) and again from "Start the tour" in the User guide.
 */
export function Tour() {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const desktop = useMediaQuery(useTheme().breakpoints.up("md"));
  const { running, step, go, stop, start, setTarget } = useTourStore();
  const allowed = canExtract(me.data);
  const steps = useMemo(() => tourStepsFor(me.data?.role, allowed), [me.data?.role, allowed]);
  const current = running ? steps[step] : undefined;
  const [box, setBox] = useState<{ target: string; rect: Rect } | null>(null);
  const autoStarted = useRef(false);

  const finish = () => {
    if (me.data) writeStored(doneKey(me.data.id), new Date().toISOString());
    stop();
  };
  const next = () => (step + 1 < steps.length ? go(step + 1) : finish());
  const back = () => step > 0 && go(step - 1);

  // First visit: start once, for approved users who have not finished or skipped it in this browser.
  useEffect(() => {
    if (autoStarted.current || !me.data || me.data.status !== "approved" || !desktop) return;
    autoStarted.current = true;
    if (!readStored(doneKey(me.data.id)) && !useTourStore.getState().running) start();
  }, [me.data, desktop, start]);

  // Each step: tell the layout what is highlighted (it opens the sidebar for sidebar steps), open the step's page, then
  // wait for the element and follow it (scrolling, resizing, the sidebar sliding in) until the step changes.
  useEffect(() => {
    if (!current) return;
    setTarget(current.target);
    if (current.page && pathname !== current.page) {
      router.push(current.page);
      return; // runs again on the new page
    }
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const since = Date.now();
    let last: Rect | null = null;

    const follow = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const rect = { top: r.top, left: r.left, width: r.width, height: r.height };
      if (!last || Math.abs(last.top - rect.top) + Math.abs(last.left - rect.left) + Math.abs(last.width - rect.width) + Math.abs(last.height - rect.height) > 0.5) {
        last = rect;
        setBox({ target: current.target, rect });
      }
      frame = requestAnimationFrame(() => follow(el));
    };
    const find = () => {
      const el = findTarget(current.target);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.top < 64 || r.bottom > window.innerHeight) el.scrollIntoView({ block: "center", behavior: "smooth" });
        follow(el);
      } else if (Date.now() - since > WAIT_MS) {
        // Not on this screen (e.g. another Dashboard tab is open): go on without it.
        const s = useTourStore.getState();
        if (s.step + 1 < steps.length) s.go(s.step + 1);
        else s.stop();
      } else {
        timer = setTimeout(find, 100);
      }
    };
    find();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [current, pathname, router, setTarget, steps.length]);

  // Keys: Esc skips the tour, arrows move between steps.
  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!current) return null;
  const rect = box?.target === current.target ? box.rect : null;
  const z = 1400; // above the app bar, drawers and dialogs
  const spot = rect && { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 };
  const anchor = spot && { getBoundingClientRect: () => new DOMRect(spot.left, spot.top, spot.width, spot.height) };

  return (
    <>
      {/* Blocks clicks on the page while the tour runs; the dimming comes from the highlight's shadow. */}
      <Box sx={{ position: "fixed", inset: 0, zIndex: z, bgcolor: spot ? "transparent" : "rgba(0,0,0,0.45)" }} aria-hidden />
      {spot && (
        <Box
          aria-hidden
          sx={{
            position: "fixed",
            zIndex: z,
            pointerEvents: "none",
            borderRadius: 1.5,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
            outline: (t) => `2px solid ${t.palette.primary.main}`,
            transition: "top .2s, left .2s, width .2s, height .2s",
            ...spot,
          }}
        />
      )}
      <Popper
        open={!!anchor}
        anchorEl={anchor}
        placement="bottom-start"
        sx={{ zIndex: z + 1 }}
        modifiers={[
          { name: "offset", options: { offset: [0, 12] } },
          { name: "flip", options: { fallbackPlacements: ["top-start", "right-start", "left-start"] } },
          { name: "preventOverflow", options: { padding: 12 } },
        ]}
      >
        <Paper key={step} role="dialog" aria-modal="true" aria-labelledby="tour-title" elevation={8} sx={{ p: 2, width: 340, maxWidth: "calc(100vw - 24px)" }}>
          <Typography variant="caption" color="text.secondary">
            Step {step + 1} of {steps.length}
          </Typography>
          <Typography id="tour-title" variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
            {current.title}
          </Typography>
          <Typography variant="body2">{current.text}</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: "center" }}>
            <Button size="small" color="inherit" onClick={finish}>
              Skip tour
            </Button>
            <Box sx={{ flexGrow: 1 }} />
            {step > 0 && (
              <Button size="small" onClick={back}>
                Back
              </Button>
            )}
            <Button size="small" variant="contained" onClick={next} autoFocus>
              {step + 1 < steps.length ? "Next" : "Done"}
            </Button>
          </Stack>
        </Paper>
      </Popper>
    </>
  );
}
