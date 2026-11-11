"use client";

import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";
import ChatBubbleOutlinedIcon from "@mui/icons-material/ChatBubbleOutlined";
import FiberNewOutlinedIcon from "@mui/icons-material/FiberNewOutlined";
import MarkChatUnreadOutlinedIcon from "@mui/icons-material/MarkChatUnreadOutlined";
import SentimentDissatisfiedOutlinedIcon from "@mui/icons-material/SentimentDissatisfiedOutlined";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import type { ReactNode } from "react";
import { KPI_GRID_SX, KpiCard, type KpiTone } from "@/components/kpi-card";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { RetryAlert } from "@/components/ui/retry-alert";
import type { OverviewStats } from "@/lib/schemas/locations";

interface Card {
  label: string;
  value: string;
  tone: KpiTone;
  icon: ReactNode;
}

function toCards(s: OverviewStats): Card[] {
  return [
    { label: "Locations", value: s.location_count.toLocaleString(), tone: "primary", icon: <StorefrontOutlinedIcon /> },
    { label: "Total reviews", value: s.total_reviews.toLocaleString(), tone: "primary", icon: <ChatBubbleOutlinedIcon /> },
    { label: "Average rating", value: s.avg_rating === null ? "–" : s.avg_rating.toFixed(2), tone: "primary", icon: <StarBorderIcon /> },
    { label: "New (7 days)", value: s.new_reviews_7d.toLocaleString(), tone: "primary", icon: <FiberNewOutlinedIcon /> },
    { label: "Unanswered", value: s.unanswered.toLocaleString(), tone: s.unanswered > 0 ? "warning" : "primary", icon: <MarkChatUnreadOutlinedIcon /> },
    { label: "1–2 star", value: s.low_rating.toLocaleString(), tone: s.low_rating > 0 ? "error" : "primary", icon: <SentimentDissatisfiedOutlinedIcon /> },
  ];
}

export function StatCards({
  stats,
  loading,
  error,
  onRetry,
}: {
  stats?: OverviewStats;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  if (error) return <RetryAlert what="the summary" onRetry={onRetry} />;
  if (loading || !stats) {
    return (
      <LoadingOverlay active>
        <Box sx={KPI_GRID_SX}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} variant="rounded" height={84} />
          ))}
        </Box>
      </LoadingOverlay>
    );
  }
  return (
    <Box sx={KPI_GRID_SX}>
      {toCards(stats).map((c) => (
        <KpiCard key={c.label} {...c} />
      ))}
    </Box>
  );
}
