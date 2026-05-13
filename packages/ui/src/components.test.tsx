import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ActionQueueRow,
  DetailPanel,
  ObjectList,
  RichContentEditor,
  StatusBadge,
  validateRichContent
} from "./index";

describe("FeedbackOps shared UI components", () => {
  it("marks selected object rows", () => {
    render(
      <ObjectList
        items={[
          { id: "voc-1", title: "First VOC", meta: "Tableau" },
          { id: "voc-2", title: "Second VOC", meta: "Looker" }
        ]}
        selectedId="voc-2"
        onSelect={() => undefined}
      />
    );

    expect(screen.getByRole("button", { name: /Second VOC/ })).toHaveAttribute("aria-current", "true");
  });

  it("renders permission blocked detail state", () => {
    render(
      <DetailPanel title="Restricted finding" permissionBlocked summary="Summary visible to reporter">
        Private body
      </DetailPanel>
    );

    expect(screen.getByText("Summary visible to reporter")).toBeInTheDocument();
    expect(screen.getByText("Request access")).toBeInTheDocument();
    expect(screen.queryByText("Private body")).not.toBeInTheDocument();
  });

  it("separates reporter VOC status and internal task status badges", () => {
    render(
      <>
        <StatusBadge family="reporter-voc" value="검토 중" />
        <StatusBadge family="task" value="Released" />
      </>
    );

    expect(screen.getByText("검토 중")).toHaveAttribute("data-family", "reporter-voc");
    expect(screen.getByText("Released")).toHaveAttribute("data-family", "task");
  });

  it("exposes action queue next action text", () => {
    render(
      <ActionQueueRow
        title="High severity VOC"
        reason="No linked Finding or Task Request"
        nextAction="Create Finding or Task Request"
      />
    );

    expect(screen.getByText("Create Finding or Task Request")).toBeInTheDocument();
  });

  it("rejects base64 and external inline images in rich content", () => {
    expect(validateRichContent('<img src="data:image/png;base64,abc">').ok).toBe(false);
    expect(validateRichContent('<img src="https://example.com/a.png">').ok).toBe(false);
    expect(validateRichContent('<attachment data-id="att-1"></attachment>').ok).toBe(true);

    render(<RichContentEditor label="VOC description" value="" onChange={() => undefined} error="Unsafe inline image" />);
    expect(screen.getByLabelText("VOC description")).toBeInTheDocument();
    expect(screen.getByText("Unsafe inline image")).toBeInTheDocument();
  });
});
