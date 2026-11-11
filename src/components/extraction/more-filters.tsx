"use client";

import { useState } from "react";
import Badge from "@mui/material/Badge";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Popover from "@mui/material/Popover";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import FilterListIcon from "@mui/icons-material/FilterList";
import { SelectField, type Option } from "@/components/ui/select-field";
import { EMPTY_REVIEW_FILTER, type ReviewFilterState } from "./review-filter";

const REPLIED: Option[] = [
  { value: "", label: "Any" },
  { value: "yes", label: "Replied" },
  { value: "no", label: "Not replied" },
];
const HAS_COMMENT: Option[] = [
  { value: "", label: "Any" },
  { value: "yes", label: "With comment" },
  { value: "no", label: "Rating only" },
];
const REPLY_TIME: Option[] = [
  { value: "", label: "Any" },
  { value: "day", label: "Within 1 day" },
  { value: "week", label: "1–7 days" },
  { value: "slow", label: "Over 7 days" },
];
const SEARCH_IN: Option[] = [
  { value: "all", label: "Comment, reply and name" },
  { value: "comment", label: "Comment" },
  { value: "reply", label: "Reply" },
  { value: "name", label: "Reviewer name" },
];

type ExtraKey = "replied" | "hasComment" | "region" | "island" | "replyTime" | "searchIn";

/**
 * The less-used review filters, behind a "More filters" button, with each one that is set shown as a chip that removes
 * it. `regions` and `islands` are the choices the user's locations have (as on the Dashboard).
 */
export function MoreFilters({
  filter,
  onChange,
  regions,
  islands,
}: {
  filter: ReviewFilterState;
  onChange: (patch: Partial<ReviewFilterState>) => void;
  regions: Option[];
  islands: Option[];
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const label = (options: Option[], value: string) => options.find((o) => o.value === value)?.label ?? value;

  const fields: [key: ExtraKey, name: string, options: Option[]][] = [
    ["replied", "Reply status", REPLIED],
    ["hasComment", "Comment", HAS_COMMENT],
    ["replyTime", "Reply time", REPLY_TIME],
    ["region", "Region", [{ value: "", label: "All regions" }, ...regions]],
    ["island", "Island group", [{ value: "", label: "All" }, ...islands]],
    ["searchIn", "Search in", SEARCH_IN],
  ];
  const active = fields.filter(([key]) => filter[key] !== EMPTY_REVIEW_FILTER[key]);

  return (
    <>
      <Badge badgeContent={active.length} color="primary">
        <Button variant="outlined" startIcon={<FilterListIcon />} onClick={(e) => setAnchor(e.currentTarget)} aria-haspopup="dialog">
          More filters
        </Button>
      </Badge>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{ paper: { sx: { p: 2, width: 300, maxWidth: "calc(100vw - 32px)" } } }}
      >
        <Stack spacing={2}>
          {fields.map(([key, name, options]) => (
            <SelectField key={key} label={name} value={filter[key]} options={options} fullWidth onChange={(v) => onChange({ [key]: v })} />
          ))}
          <Typography variant="caption" color="text.secondary">
            Reply time is measured from the review to the owner&apos;s reply. It is approximate when Google only shows when the reply was posted as, for example, &quot;3 weeks ago&quot;.
          </Typography>
        </Stack>
      </Popover>
      {active.map(([key, name, options]) => (
        <Chip
          key={key}
          label={`${name}: ${label(options, filter[key])}`}
          onDelete={() => onChange({ [key]: EMPTY_REVIEW_FILTER[key] })}
          sx={{ alignSelf: "center" }}
        />
      ))}
    </>
  );
}
