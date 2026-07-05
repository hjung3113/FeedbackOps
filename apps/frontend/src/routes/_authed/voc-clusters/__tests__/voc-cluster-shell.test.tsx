import { fireEvent, render, screen } from "@testing-library/react";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
let routeParams: Record<string, string> = {
  clusterId: "11111111-1111-1111-1111-111111111111",
};

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => ({
    ...(config as object),
    useParams: () => routeParams,
  }),
  Link: ({
    children,
    to,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useNavigate: () => navigateMock,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: {
      items: [
        {
          id: "99999999-9999-9999-9999-999999999999",
          name: "Billing Ops",
          archived_at: null,
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@fops/ui", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  DetailPanelHeader: ({
    kind,
    id,
    onClose,
  }: {
    kind: string;
    id: string;
    onClose: () => void;
  }) => (
    <header data-testid="detail-panel-header" data-kind={kind}>
      <span>{id}</span>
      <button type="button" onClick={onClose}>
        닫기
      </button>
    </header>
  ),
  Dialog: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open?: boolean;
  }) => (open ? <>{children}</> : null),
  DialogContent: ({ children, ...props }: { children: React.ReactNode }) => (
    <div {...props}>{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  FieldLabel: ({ children }: { children: React.ReactNode }) => (
    <label>{children}</label>
  ),
  FieldRow: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
  Label: ({
    children,
    ...props
  }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...props}>{children}</label>
  ),
  ListShell: ({
    toolbar,
    list,
    detailPanel,
  }: {
    toolbar?: { title: string; subtitle?: string; actions?: React.ReactNode };
    list: React.ReactNode;
    detailPanel?: React.ReactNode;
  }) => (
    <div data-shell="list">
      {toolbar && (
        <header data-testid="list-shell-toolbar">
          <h1>{toolbar.title}</h1>
          {toolbar.subtitle && <p>{toolbar.subtitle}</p>}
          <div>{toolbar.actions}</div>
        </header>
      )}
      <main>{list}</main>
      <aside data-testid="list-shell-detail-slot">{detailPanel}</aside>
    </div>
  ),
  ManagedSystemPill: ({ name }: { name: string }) => (
    <span data-testid="managed-system-pill">{name}</span>
  ),
  ObjectRow: ({
    id,
    title,
    badges,
    meta,
    selected,
    onClick,
  }: {
    id?: string;
    title: React.ReactNode;
    badges?: React.ReactNode;
    meta?: React.ReactNode;
    selected?: boolean;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
  }) => (
    <button
      type="button"
      data-testid={`cluster-row-${id}`}
      data-selected={selected ? "true" : "false"}
      onClick={onClick}
    >
      <span>{id}</span>
      <span>{title}</span>
      <span>{badges}</span>
      <span>{meta}</span>
    </button>
  ),
  OutlineBadge: ({ children, ...props }: { children: React.ReactNode }) => (
    <span {...props}>{children}</span>
  ),
  PanelSectionTitle: ({ children }: { children: React.ReactNode }) => (
    <h3>{children}</h3>
  ),
  PageShell: ({ children }: { children: React.ReactNode }) => (
    <div data-shell="page">{children}</div>
  ),
  Select: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
  SelectValue: () => <span />,
  Skeleton: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
}));

const clusters = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    workspace_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    title: "반복 결제 문의",
    summary: "결제 관련 VOC가 반복됩니다.",
    status: "draft" as const,
    primary_managed_system_id: "99999999-9999-9999-9999-999999999999",
    created_by: "22222222-2222-2222-2222-222222222222",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    members: [
      {
        voc_id: "33333333-3333-3333-3333-333333333333",
        display_id: "VOC-333",
        title: "결제 실패 문의",
        added_by: "22222222-2222-2222-2222-222222222222",
        added_at: "2026-01-03T00:00:00.000Z",
      },
    ],
  },
];

vi.mock("@/features/voc-cluster/hooks/useVocClusterList", () => ({
  useVocClusterList: () => ({
    data: { items: clusters },
    isPending: false,
    isError: false,
  }),
}));

vi.mock("@/features/voc-cluster/hooks/useVocClusterDetail", () => ({
  useVocClusterDetail: () => ({
    data: clusters[0],
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock("@/features/voc-cluster/hooks/useCreateVocCluster", () => ({
  useCreateVocCluster: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/features/voc-cluster/hooks/useAddClusterMember", () => ({
  useAddClusterMember: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/features/voc-cluster/hooks/useConfirmCluster", () => ({
  useConfirmCluster: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/features/voc-cluster/hooks/useCreateFindingFromCluster", () => ({
  useCreateFindingFromCluster: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/features/voc-cluster/hooks/useRemoveClusterMember", () => ({
  useRemoveClusterMember: () => ({
    mutate: vi.fn(),
    isPending: false,
    variables: undefined,
  }),
}));

vi.mock("@/features/voc-cluster/hooks/useRequestTaskFromCluster", () => ({
  useRequestTaskFromCluster: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/features/tasks/components/RequestTaskModal", () => ({
  RequestTaskModal: () => null,
}));

vi.mock("@/lib/auth/useMe", () => ({
  useMe: () => ({ data: { actor: { role_level: "admin" } } }),
}));

vi.mock("@/lib/api", () => ({
  fetchManagedSystems: vi.fn(),
  errorMapper: () => ({ message: "mapped error" }),
  useIdempotencyKey: () => ({ key: "idem-key", markConsumed: vi.fn() }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("react-hook-form", () => ({
  useForm: () => ({
    register: vi.fn(),
    handleSubmit: (fn: unknown) => fn,
    reset: vi.fn(),
    setValue: vi.fn(),
    formState: { errors: {} },
  }),
}));

vi.mock("@hookform/resolvers/zod", () => ({ zodResolver: vi.fn() }));

describe("VOC cluster route shells", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    routeParams = { clusterId: "11111111-1111-1111-1111-111111111111" };
  });

  it("renders the cluster index as a ListShell with the selected cluster detail panel", async () => {
    const { VocClusterListPage } = await import("../index");

    render(<VocClusterListPage />);

    expect(screen.getAllByText("반복 결제 문의").length).toBeGreaterThan(0);
    expect(screen.getByTestId("list-shell-toolbar")).toHaveTextContent(
      "VOC 클러스터",
    );
    expect(screen.getByTestId("list-shell-toolbar")).toHaveTextContent(
      "VOC를 유사 주제로 묶어 Finding으로 승격합니다.",
    );
    expect(screen.getByTestId("cluster-detail-panel")).toBeInTheDocument();
    expect(screen.getByTestId("list-shell-detail-slot")).toContainElement(
      screen.getByTestId("cluster-detail-panel"),
    );
    expect(
      document.querySelector('[data-shell="page"]'),
    ).not.toBeInTheDocument();
  });

  it("selects a cluster inline from the list route without route navigation", async () => {
    const { VocClusterListPage } = await import("../index");

    render(<VocClusterListPage />);

    fireEvent.click(screen.getByTestId("cluster-row-11111111..."));

    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("cluster-row-11111111...")).toHaveAttribute(
      "data-selected",
      "true",
    );
  });

  it("renders the detail route inside the same ListShell toolbar and detail framing", async () => {
    const { VocClusterDetailPage } = await import("../$clusterId");

    render(<VocClusterDetailPage />);

    expect(document.querySelector('[data-shell="list"]')).toBeInTheDocument();
    expect(screen.getByTestId("list-shell-toolbar")).toHaveTextContent(
      "VOC 클러스터",
    );
    expect(screen.getByTestId("list-shell-toolbar")).toHaveTextContent(
      "VOC를 유사 주제로 묶어 Finding으로 승격합니다.",
    );
    expect(screen.getByTestId("cluster-detail-panel")).toBeInTheDocument();
    expect(
      document.querySelector('[data-shell="page"]'),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('a[href="/voc-clusters"]'),
    ).not.toBeInTheDocument();
  });

  it("uses managed-system and VOC display labels instead of raw UUIDs in cluster detail", async () => {
    const { VocClusterDetailPanel } = await import("../$clusterId");

    render(
      <VocClusterDetailPanel
        clusterId="11111111-1111-1111-1111-111111111111"
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByTestId("managed-system-pill")).toHaveTextContent(
      "Billing Ops",
    );
    expect(
      screen.queryByText("99999999-9999-9999-9999-999999999999"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/VOC-333/)).toBeInTheDocument();
    expect(screen.getByText("결제 실패 문의")).toBeInTheDocument();
    expect(screen.queryByText(/VOC 33333333/)).not.toBeInTheDocument();
  });
});
