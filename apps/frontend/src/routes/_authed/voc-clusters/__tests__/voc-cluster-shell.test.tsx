import { fireEvent, render, screen } from "@testing-library/react";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";

const navigateMock = vi.fn();
const addClusterMemberMutate = vi.hoisted(() => vi.fn());
const linkFindingMutate = vi.hoisted(() => vi.fn());
const currentRole = vi.hoisted(() => ({ role_level: "admin" as string }));
const listQueryState = vi.hoisted(() => ({
  status: "success" as "pending" | "success",
}));
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
    params,
  }: {
    children: React.ReactNode;
    to: string;
    className?: string;
    params?: Record<string, string>;
  }) => (
    <a
      href={
        params
          ? Object.entries(params).reduce(
              (path, [key, value]) => path.replace(`$${key}`, value),
              to,
            )
          : to
      }
      className={className}
    >
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
  cn: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(" "),
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
  DetailPanelSectionNav: ({
    sections,
  }: {
    sections: Array<{ id: string; label: string }>;
  }) => (
    <nav>
      {sections.map((section) => (
        <span key={section.id}>{section.label}</span>
      ))}
    </nav>
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
  ReporterStatusBadge: ({ status }: { status: string }) => (
    <span data-testid={`reporter-status-${status}`}>{status}</span>
  ),
  SeverityBadge: ({ severity }: { severity: string }) => <span>{severity}</span>,
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

type ClusterFixture = {
  id: string;
  workspace_id: string;
  display_id: string;
  title: string;
  summary: string | null;
  severity?: string | null;
  confidence?: string | null;
  rationale?: string | null;
  owner_user_id?: string | null;
  confirmed_by?: string | null;
  confirmed_at?: string | null;
  status: string;
  primary_managed_system_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  members: Array<{
    voc_id: string;
    display_id: string;
    title: string;
    severity?: string | null;
    reporter_facing_status?: string;
    added_by: string;
    added_at: string;
  }>;
  linked_findings: Array<{
    id: string;
    display_id: string;
    status: string;
    title?: string;
  }>;
};

const clusters: ClusterFixture[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    workspace_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    display_id: "CLU-31",
    title: "반복 결제 문의",
    summary: "결제 관련 VOC가 반복됩니다.",
    status: "draft" as string,
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
    linked_findings: [] as Array<{
      id: string;
      display_id: string;
      status: string;
    }>,
  },
];

vi.mock("@/features/voc-cluster/hooks/useVocClusterList", () => ({
  useVocClusterList: () => ({
    data: listQueryState.status === "success" ? { items: clusters } : undefined,
    isPending: listQueryState.status === "pending",
    isError: false,
    isSuccess: listQueryState.status === "success",
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
    mutate: addClusterMemberMutate,
    reset: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/features/voc-cluster/hooks/useCandidatePeers", () => ({
  useCandidatePeers: () => ({
    data: {
      candidate_basis: "same_managed_system_active_voc",
      candidates: [
        {
          voc_id: "44444444-4444-4444-4444-444444444444",
          display_id: "VOC-444",
          title: "결제 재시도 안내 요청",
          severity: "high",
          reporter_facing_status: "received",
        },
      ],
    },
    isLoading: false,
    isError: false,
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

vi.mock(
  "@/features/voc-cluster/hooks/useLinkExistingFindingToVocCluster",
  () => ({
    useLinkExistingFindingToVocCluster: () => ({
      mutate: linkFindingMutate,
      reset: vi.fn(),
      isPending: false,
    }),
  }),
);

vi.mock("@/features/integration/hooks/useFindingsList", () => ({
  useFindingsList: () => ({
    data: {
      items: [
        {
          id: "55555555-5555-5555-5555-555555555555",
          display_id: "FIN-555",
          title: "기존 결제 Finding",
        },
      ],
    },
    isLoading: false,
    isError: false,
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
  useMe: () => ({ data: { actor: currentRole } }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    fetchManagedSystems: vi.fn(),
    useIdempotencyKey: () => ({ key: "idem-key", markConsumed: vi.fn() }),
  };
});

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
    addClusterMemberMutate.mockClear();
    linkFindingMutate.mockClear();
    listQueryState.status = "success";
    currentRole.role_level = "admin";
    routeParams = { clusterId: "11111111-1111-1111-1111-111111111111" };
    clusters.splice(1);
    clusters[0]!.status = "draft";
    clusters[0]!.linked_findings = [];
    clusters[0]!.summary = "결제 관련 VOC가 반복됩니다.";
    delete clusters[0]!.severity;
    delete clusters[0]!.confidence;
    delete clusters[0]!.rationale;
    delete clusters[0]!.owner_user_id;
    delete clusters[0]!.confirmed_by;
    delete clusters[0]!.confirmed_at;
    clusters[0]!.members = [
      {
        voc_id: "33333333-3333-3333-3333-333333333333",
        display_id: "VOC-333",
        title: "결제 실패 문의",
        added_by: "22222222-2222-2222-2222-222222222222",
        added_at: "2026-01-03T00:00:00.000Z",
      },
    ];
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

    fireEvent.click(screen.getByTestId("cluster-row-CLU-31"));

    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("cluster-row-CLU-31")).toHaveAttribute(
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
    expect(screen.getAllByText("CLU-31").length).toBeGreaterThan(0);
  });

  it("filters list rows by All, Confirmed, and No finding without a backend filter", async () => {
    const baseCluster = clusters[0]!;
    clusters.push(
      {
        ...baseCluster,
        id: "55555555-5555-5555-5555-555555555555",
        display_id: "CLU-32",
        title: "확정된 연결 없음",
        status: "confirmed",
        linked_findings: [],
      },
      {
        ...baseCluster,
        id: "66666666-6666-6666-6666-666666666666",
        display_id: "CLU-33",
        title: "연결된 Finding 있음",
        status: "draft",
        linked_findings: [
          {
            id: "77777777-7777-7777-7777-777777777777",
            display_id: "FIN-777",
            status: "active",
          },
        ],
      },
    );
    const { VocClusterListShell } = await import("../$clusterId");

    render(
      <VocClusterListShell
        selectedId={null}
        onSelect={vi.fn()}
        onCloseDetail={vi.fn()}
      />,
    );

    expect(screen.getByText("반복 결제 문의")).toBeInTheDocument();
    expect(screen.getByText("확정된 연결 없음")).toBeInTheDocument();
    expect(screen.getByText("연결된 Finding 있음")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("cluster-tab-confirmed"));
    expect(screen.getByText("확정된 연결 없음")).toBeInTheDocument();
    expect(screen.queryByText("반복 결제 문의")).not.toBeInTheDocument();
    expect(screen.queryByText("연결된 Finding 있음")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("cluster-tab-no-finding"));
    expect(screen.getByText("반복 결제 문의")).toBeInTheDocument();
    expect(screen.getByText("확정된 연결 없음")).toBeInTheDocument();
    expect(screen.queryByText("연결된 Finding 있음")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("cluster-tab-all"));
    expect(screen.getByText("반복 결제 문의")).toBeInTheDocument();
    expect(screen.getByText("확정된 연결 없음")).toBeInTheDocument();
    expect(screen.getByText("연결된 Finding 있음")).toBeInTheDocument();
  });

  it("clears an inline detail selection when its tab excludes the selected cluster without navigation", async () => {
    const baseCluster = clusters[0]!;
    clusters.push({
      ...baseCluster,
      id: "55555555-5555-5555-5555-555555555555",
      display_id: "CLU-32",
      title: "확정된 연결 없음",
      status: "confirmed",
    });
    const onSelect = vi.fn();
    const onCloseDetail = vi.fn();
    const { VocClusterListShell } = await import("../$clusterId");

    render(
      <VocClusterListShell
        selectedId={baseCluster.id}
        onSelect={onSelect}
        onCloseDetail={onCloseDetail}
      />,
    );

    expect(screen.getByTestId("cluster-detail-panel")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("cluster-tab-confirmed"));

    expect(
      screen.queryByTestId("cluster-detail-panel"),
    ).not.toBeInTheDocument();
    expect(onCloseDetail).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("keeps a deeplinked detail selection open while the list query is pending", async () => {
    const selectedId = clusters[0]!.id;
    const onCloseDetail = vi.fn();
    const { VocClusterListShell } = await import("../$clusterId");
    listQueryState.status = "pending";

    const { rerender } = render(
      <VocClusterListShell
        selectedId={selectedId}
        onSelect={vi.fn()}
        onCloseDetail={onCloseDetail}
      />,
    );

    expect(
      screen.queryByTestId("cluster-detail-panel"),
    ).not.toBeInTheDocument();
    expect(onCloseDetail).not.toHaveBeenCalled();

    listQueryState.status = "success";
    rerender(
      <VocClusterListShell
        selectedId={selectedId}
        onSelect={vi.fn()}
        onCloseDetail={onCloseDetail}
      />,
    );

    expect(screen.getByTestId("cluster-detail-panel")).toBeInTheDocument();
    expect(onCloseDetail).not.toHaveBeenCalled();
  });

  it("renders every linked Finding in Execution and exposes its finding route", async () => {
    clusters[0]!.linked_findings = [
      {
        id: "77777777-7777-7777-7777-777777777777",
        display_id: "FIN-777",
        status: "active",
        title: "결제 오류 개선",
      },
      {
        id: "88888888-8888-8888-8888-888888888888",
        display_id: "FIN-888",
        status: "validated",
        title: "결제 안내 개선",
      },
    ];
    const { VocClusterDetailPanel } = await import("../$clusterId");

    render(
      <VocClusterDetailPanel
        clusterId="11111111-1111-1111-1111-111111111111"
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId("cluster-linked-findings-list"),
    ).toBeInTheDocument();
    expect(screen.getByText("FIN-777")).toBeInTheDocument();
    expect(screen.getByText("결제 오류 개선")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("FIN-888")).toBeInTheDocument();
    expect(screen.getByText("validated")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Finding 열기" })[0],
    ).toHaveAttribute("href", "/findings/77777777-7777-7777-7777-777777777777");
    expect(
      screen.queryByTestId("cluster-execution-empty"),
    ).not.toBeInTheDocument();
  });

  it("shows Execution create and link CTAs when no Finding is linked", async () => {
    const { VocClusterDetailPanel } = await import("../$clusterId");

    render(
      <VocClusterDetailPanel
        clusterId="11111111-1111-1111-1111-111111111111"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("cluster-execution-empty")).toBeInTheDocument();
    expect(
      screen.getByTestId("cluster-execution-create-finding"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("cluster-link-existing-finding-button"),
    ).toBeEnabled();
    expect(
      screen.queryByTestId("cluster-linked-findings-list"),
    ).not.toBeInTheDocument();
  });

  it("disables the link-existing-Finding CTA for non-mutating roles", async () => {
    currentRole.role_level = "user";
    const { VocClusterDetailPanel } = await import("../$clusterId");

    render(
      <VocClusterDetailPanel
        clusterId="11111111-1111-1111-1111-111111111111"
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId("cluster-link-existing-finding-button"),
    ).toBeDisabled();
  });

  it("renders rich nullable fields, five section anchors, member reporter status, and truncates members", async () => {
    clusters[0]!.severity = "high";
    clusters[0]!.confidence = "medium";
    clusters[0]!.rationale = "같은 결제 실패 패턴입니다.";
    clusters[0]!.owner_user_id = "owner-1";
    clusters[0]!.confirmed_by = "confirmer-1";
    clusters[0]!.confirmed_at = "2026-01-03T00:00:00.000Z";
    clusters[0]!.members = Array.from({ length: 5 }, (_, index) => ({
      ...clusters[0]!.members[0]!,
      voc_id: `33333333-3333-3333-3333-33333333333${index}`,
      reporter_facing_status: "reviewing",
    }));
    const { VocClusterDetailPanel } = await import("../$clusterId");
    const { container } = render(
      <VocClusterDetailPanel clusterId={clusters[0]!.id} onClose={vi.fn()} />,
    );
    for (const anchor of [
      "overview",
      "why",
      "execution",
      "members",
      "properties",
    ])
      expect(
        container.querySelector(`[data-anchor="${anchor}"]`),
      ).toBeInTheDocument();
    expect(screen.getByTestId("cluster-detail-rationale")).toHaveTextContent(
      "같은 결제 실패 패턴입니다.",
    );
    expect(screen.getByTestId("cluster-detail-severity")).toHaveTextContent(
      "high",
    );
    expect(screen.getByTestId("cluster-detail-owner")).toHaveTextContent(
      "owner-1",
    );
    expect(screen.getAllByTestId("reporter-status-reviewing")).toHaveLength(4);
    expect(screen.getByTestId("cluster-members-more")).toHaveTextContent(
      "+1 더보기",
    );
  });

  it("renders graceful empty values for nullable cluster fields", async () => {
    clusters[0]!.summary = null;
    clusters[0]!.severity = null;
    clusters[0]!.confidence = null;
    clusters[0]!.rationale = null;
    clusters[0]!.owner_user_id = null;
    clusters[0]!.confirmed_by = null;
    clusters[0]!.confirmed_at = null;
    const { VocClusterDetailPanel } = await import("../$clusterId");
    render(
      <VocClusterDetailPanel clusterId={clusters[0]!.id} onClose={vi.fn()} />,
    );
    expect(
      screen.getByTestId("cluster-detail-summary-empty"),
    ).toHaveTextContent("요약이 없습니다.");
    expect(
      screen.getByTestId("cluster-detail-rationale-empty"),
    ).toHaveTextContent("그룹화 이유가 없습니다.");
    expect(screen.getByTestId("cluster-detail-severity")).toHaveTextContent(
      "미지정",
    );
    expect(screen.getByTestId("cluster-detail-owner")).toHaveTextContent(
      "담당자 없음",
    );
    expect(screen.getByTestId("cluster-detail-confirmed-by")).toHaveTextContent(
      "대기 중",
    );
  });

  it("submits a selected existing Finding and closes the picker on success", async () => {
    const { VocClusterDetailPanel } = await import("../$clusterId");
    linkFindingMutate.mockImplementation(
      (_variables: unknown, callbacks: { onSuccess: () => void }) =>
        callbacks.onSuccess(),
    );
    render(
      <VocClusterDetailPanel clusterId={clusters[0]!.id} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId("cluster-link-existing-finding-button"));
    fireEvent.change(screen.getByTestId("link-existing-finding-picker"), {
      target: { value: "55555555-5555-5555-5555-555555555555" },
    });
    fireEvent.submit(document.getElementById("link-existing-finding-form")!);
    expect(linkFindingMutate).toHaveBeenCalledWith(
      {
        clusterId: clusters[0]!.id,
        findingId: "55555555-5555-5555-5555-555555555555",
      },
      expect.any(Object),
    );
    expect(
      screen.queryByTestId("link-existing-finding-modal"),
    ).not.toBeInTheDocument();
  });

  it.each([
    [403, "permission.scope_required", "해당 Managed System에 대한 권한이 없습니다."],
    [404, "not_found.record", "존재하지 않거나 접근할 수 없는 항목입니다."],
  ] as const)(
    "surfaces the $1 / $2 non-disclosing link error",
    async (status, code, expectedMessage) => {
      const { VocClusterDetailPanel } = await import("../$clusterId");
      const error = new ApiError(status, { code, message: "backend detail" });
      expect(error.status).toBe(status);
      expect(error.envelope.code).toBe(code);
      linkFindingMutate.mockImplementation(
        (
          _variables: unknown,
          callbacks: { onError: (error: unknown) => void },
        ) => callbacks.onError(error),
      );
      render(
        <VocClusterDetailPanel clusterId={clusters[0]!.id} onClose={vi.fn()} />,
      );
      fireEvent.click(
        screen.getByTestId("cluster-link-existing-finding-button"),
      );
      fireEvent.change(screen.getByTestId("link-existing-finding-picker"), {
        target: { value: "55555555-5555-5555-5555-555555555555" },
      });
      fireEvent.submit(document.getElementById("link-existing-finding-form")!);
      expect(linkFindingMutate).toHaveBeenCalledWith(
        {
          clusterId: clusters[0]!.id,
          findingId: "55555555-5555-5555-5555-555555555555",
        },
        expect.any(Object),
      );
      expect(
        screen.getByTestId("link-existing-finding-error"),
      ).toHaveTextContent(expectedMessage);
    },
  );

  it("picks a candidate peer and submits its VOC id instead of accepting a raw UUID", async () => {
    const { VocClusterDetailPanel } = await import("../$clusterId");

    render(
      <VocClusterDetailPanel
        clusterId="11111111-1111-1111-1111-111111111111"
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("cluster-add-voc-button"));
    expect(screen.getByTestId("add-voc-candidate-picker")).toHaveTextContent(
      "VOC-444 · 결제 재시도 안내 요청 · high · received",
    );
    expect(screen.queryByTestId("add-voc-id-input")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("add-voc-candidate-picker"), {
      target: { value: "44444444-4444-4444-4444-444444444444" },
    });
    fireEvent.submit(screen.getByTestId("add-voc-form"));

    expect(addClusterMemberMutate).toHaveBeenCalledWith(
      {
        clusterId: "11111111-1111-1111-1111-111111111111",
        vocId: "44444444-4444-4444-4444-444444444444",
      },
      expect.any(Object),
    );
  });
});
