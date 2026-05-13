import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";

afterEach(() => cleanup());

describe("FeedbackOps frontend MVP shell", () => {
  it("renders Home as an action dashboard first screen", () => {
    render(<App initialPath="/" />);

    expect(screen.getByRole("heading", { name: "Action Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("High severity VOC has no linked follow-up")).toBeInTheDocument();
    expect(screen.getByText("Create Finding or Task Request")).toBeInTheDocument();
  });

  it("renders docs-aligned Admin navigation", () => {
    render(<App initialPath="/" />);

    for (const label of ["Home", "My Work", "VOC", "Surveys", "Tasks", "Integration", "Admin"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("renders VOC list/detail with separate reporter and internal status plus composers", () => {
    render(<App initialPath="/vocs?selected=voc-seeded-tableau" />);

    expect(screen.getByRole("heading", { name: "VOC Inbox" })).toBeInTheDocument();
    expect(screen.getByText("Reporter status")).toBeInTheDocument();
    expect(screen.getByText("검토 중")).toHaveAttribute("data-family", "reporter-voc");
    expect(screen.getByText("Internal triage")).toBeInTheDocument();
    const detail = screen.getByLabelText("Seeded Tableau VOC");
    expect(within(detail).getByText("triaging")).toBeInTheDocument();
    expect(screen.getByLabelText("Public Update")).toBeInTheDocument();
    expect(screen.getByLabelText("Reporter Reply")).toBeInTheDocument();
    expect(screen.getByLabelText("Internal Comment")).toBeInTheDocument();
  });

  it("renders permission blocked content with safe summary", () => {
    render(<App initialPath="/integration/findings?selected=restricted-finding" />);

    expect(screen.getByText("Summary visible to reporter")).toBeInTheDocument();
    expect(screen.getByText("Request access")).toBeInTheDocument();
    expect(screen.queryByText("Private root-cause notes")).not.toBeInTheDocument();
  });

  it("does not expose Survey Response to VOC conversion", () => {
    render(<App initialPath="/surveys/survey-1/results" />);

    expect(screen.getByRole("heading", { name: "Survey Results" })).toBeInTheDocument();
    expect(screen.queryByText(/Create VOC/i)).not.toBeInTheDocument();
    expect(screen.getByText("Create Finding")).toBeInTheDocument();
  });
});
