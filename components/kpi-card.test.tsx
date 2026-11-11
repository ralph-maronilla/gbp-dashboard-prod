import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiCard } from "./kpi-card";

describe("KpiCard", () => {
  it("shows the label and the value", () => {
    render(<KpiCard label="Total reviews" value="11,485" />);
    expect(screen.getByText("Total reviews")).toBeInTheDocument();
    expect(screen.getByText("11,485")).toBeInTheDocument();
  });
});
