"use client";

import { useParams } from "next/navigation";
import { LocationDetailView } from "@/components/location-detail/location-detail-view";

export default function LocationDetailPage() {
  const { id } = useParams<{ id: string }>();
  // key={id}: moving between locations remounts the view so filters and the URL reset cleanly.
  return <LocationDetailView key={id} id={id} />;
}
