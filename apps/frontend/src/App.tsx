import {
  ActionQueueRow,
  DetailPanel,
  EvidenceHighlight,
  LinkedEntityTrail,
  ObjectList,
  PermissionBlockedPanel,
  RichContentEditor,
  SignalBadge,
  StatusBadge
} from "@feedbackops/ui";
import { BarChart3, ClipboardList, Home, Inbox, Link2, Settings, SquareKanban, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const defaultActorId = "admin";

interface ManagedSystemDto {
  id: string;
  name: string;
}

interface VocDto {
  id: string;
  managed_system_id: string;
  analytics_area_id?: string;
  title: string;
  description: string;
  severity?: string;
  triage_state: string;
  reporter_facing_status: string;
}

interface QueueDto {
  id: string;
  title: string;
  reason?: string;
  next_action: string;
}

interface DashboardQueuesDto {
  high_severity_follow_up: QueueDto[];
  task_requests_pending_review: QueueDto[];
}

async function apiGet<T>(path: string, actorId = defaultActorId): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { headers: { "x-actor-id": actorId } });
  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: Record<string, unknown>, actorId = "user-tableau"): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-actor-id": actorId },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`POST ${path} failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

const navItems = [
  { label: "Home", href: "/", icon: Home },
  { label: "My Work", href: "/my-work", icon: UserRound },
  { label: "VOC", href: "/vocs", icon: Inbox },
  { label: "Surveys", href: "/surveys", icon: ClipboardList },
  { label: "Tasks", href: "/tasks", icon: SquareKanban },
  { label: "Integration", href: "/integration/findings", icon: Link2 },
  { label: "Admin", href: "/admin/managed-systems", icon: Settings }
];

function parsePath(initialPath?: string) {
  const path = initialPath ?? window.location.pathname + window.location.search;
  const url = new URL(path, "http://feedbackops.local");
  return { pathname: url.pathname, params: url.searchParams };
}

export function App({ initialPath }: { initialPath?: string }) {
  const route = useMemo(() => parsePath(initialPath), [initialPath]);
  const [selectedVocId, setSelectedVocId] = useState(route.params.get("selected") ?? "");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>FeedbackOps</strong>
          <span>Admin</span>
        </div>
        <nav aria-label="Primary">
          {navItems.map(({ label, href, icon: Icon }) => (
            <a key={label} href={href}>
              <Icon aria-hidden="true" size={16} />
              {label}
            </a>
          ))}
        </nav>
      </aside>
      <main className="main-region">{renderRoute(route.pathname, selectedVocId, setSelectedVocId)}</main>
    </div>
  );
}

function renderRoute(pathname: string, selectedVocId: string, setSelectedVocId: (id: string) => void) {
  if (pathname.startsWith("/vocs")) {
    return <VocPage selectedVocId={selectedVocId} setSelectedVocId={setSelectedVocId} />;
  }
  if (pathname.startsWith("/integration")) {
    return <IntegrationPage />;
  }
  if (pathname.startsWith("/tasks")) {
    return <TasksPage />;
  }
  if (pathname.startsWith("/admin")) {
    return <AdminPage />;
  }
  if (pathname.startsWith("/surveys")) {
    return <SurveyResultsPage />;
  }
  if (pathname.startsWith("/my-work")) {
    return <MyWorkPage />;
  }
  return <HomePage />;
}

function PageHeader({ title, kicker }: { title: string; kicker: string }) {
  return (
    <header className="page-header">
      <div>
        <span>{kicker}</span>
        <h1>{title}</h1>
      </div>
      <div className="scope-switcher" aria-label="Managed System scope">
        Managed System: Tableau
      </div>
    </header>
  );
}

function HomePage() {
  const [queues, setQueues] = useState<DashboardQueuesDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<DashboardQueuesDto>("/dashboard/action-queues")
      .then(setQueues)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Failed to load dashboard"));
  }, []);

  const rows = [...(queues?.high_severity_follow_up ?? []), ...(queues?.task_requests_pending_review ?? [])];
  return (
    <section className="page">
      <PageHeader title="Action Dashboard" kicker="Home" />
      <div className="queue-stack">
        {error ? <div className="fo-empty">{error}</div> : null}
        {!queues && !error ? <div className="fo-empty">Loading</div> : null}
        {queues && rows.length === 0 ? <div className="fo-empty">No action queues</div> : null}
        {rows.map((row) => (
          <ActionQueueRow key={row.id} title={row.title} reason={row.reason ?? "Backend queue item"} nextAction={row.next_action} />
        ))}
      </div>
    </section>
  );
}

function VocPage({
  selectedVocId,
  setSelectedVocId
}: {
  selectedVocId: string;
  setSelectedVocId: (id: string) => void;
}) {
  const [vocs, setVocs] = useState<VocDto[]>([]);
  const [managedSystems, setManagedSystems] = useState<ManagedSystemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const loadVocs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextVocs, nextManagedSystems] = await Promise.all([
        apiGet<VocDto[]>("/vocs?managed_system_id=all"),
        apiGet<ManagedSystemDto[]>("/managed-systems")
      ]);
      setVocs(nextVocs);
      setManagedSystems(nextManagedSystems);
      if (!selectedVocId && nextVocs[0]) {
        setSelectedVocId(nextVocs[0].id);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load VOCs");
    } finally {
      setLoading(false);
    }
  }, [selectedVocId, setSelectedVocId]);

  useEffect(() => {
    void loadVocs();
  }, [loadVocs]);

  async function submitVoc(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = await apiPost<VocDto>("/vocs", {
      managed_system_id: "ms-tableau",
      title,
      description
    });
    setTitle("");
    setDescription("");
    setSelectedVocId(created.id);
    await loadVocs();
  }

  const selected = vocs.find((voc) => voc.id === selectedVocId) ?? vocs[0];
  const systemName = (id: string) => managedSystems.find((system) => system.id === id)?.name ?? id;

  return (
    <section className="page split-page">
      <div className="list-region">
        <PageHeader title="VOC Inbox" kicker="VOC" />
        <form className="inline-create" onSubmit={submitVoc}>
          <label>
            <span>VOC title</span>
            <input aria-label="VOC title" value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <label>
            <span>VOC description</span>
            <textarea aria-label="VOC description" value={description} onChange={(event) => setDescription(event.target.value)} required />
          </label>
          <button className="primary-inline" type="submit">
            Submit VOC
          </button>
        </form>
        {loading ? <div className="fo-empty">Loading</div> : null}
        {error ? <div className="fo-empty">{error}</div> : null}
        <ObjectList
          items={vocs.map((voc) => ({
            id: voc.id,
            title: voc.title,
            meta: `${systemName(voc.managed_system_id)} · ${voc.severity ?? "untriaged"}`,
            signal: voc.triage_state
          }))}
          selectedId={selected?.id}
          onSelect={setSelectedVocId}
        />
      </div>
      {selected ? (
        <DetailPanel title={selected.title}>
          <div className="detail-grid">
            <div>
              <span className="field-label">Reporter status</span>
              <StatusBadge family="reporter-voc" value={selected.reporter_facing_status} />
            </div>
            <div>
              <span className="field-label">Internal triage</span>
              <SignalBadge value={selected.triage_state} urgent={selected.severity === "high"} />
            </div>
          </div>
          <p>{selected.description}</p>
          <LinkedEntityTrail links={["VOC", "Finding candidate", "Task Request candidate"]} />
          <div className="composer-grid">
            <RichContentEditor label="Public Update" value="" onChange={() => undefined} />
            <RichContentEditor label="Reporter Reply" value="" onChange={() => undefined} />
            <RichContentEditor label="Internal Comment" value="" onChange={() => undefined} />
          </div>
        </DetailPanel>
      ) : (
        <DetailPanel title="VOC detail">
          <div className="fo-empty">Select a VOC</div>
        </DetailPanel>
      )}
    </section>
  );
}

function IntegrationPage() {
  return (
    <section className="page split-page">
      <div className="list-region">
        <PageHeader title="Findings" kicker="Integration" />
        <ObjectList
          items={[{ id: "restricted-finding", title: "Restricted finding", meta: "summary_visible" }]}
          selectedId="restricted-finding"
          onSelect={() => undefined}
        />
      </div>
      <DetailPanel title="Restricted finding" permissionBlocked summary="Summary visible to reporter">
        Private root-cause notes
      </DetailPanel>
    </section>
  );
}

function TasksPage() {
  return (
    <section className="page">
      <PageHeader title="Tasks" kicker="Tasks" />
      <div className="task-board">
        <section>
          <h2>Backlog</h2>
          <p>Converted Tasks start here before Todo or Doing.</p>
        </section>
      </div>
    </section>
  );
}

function AdminPage() {
  const [managedSystems, setManagedSystems] = useState<ManagedSystemDto[]>([]);

  useEffect(() => {
    apiGet<ManagedSystemDto[]>("/managed-systems").then(setManagedSystems).catch(() => setManagedSystems([]));
  }, []);

  return (
    <section className="page">
      <PageHeader title="Managed Systems" kicker="Admin" />
      <ObjectList
        items={managedSystems.map((system) => ({ id: system.id, title: system.name, meta: "Active" }))}
        selectedId="ms-tableau"
        onSelect={() => undefined}
      />
    </section>
  );
}

function SurveyResultsPage() {
  return (
    <section className="page">
      <PageHeader title="Survey Results" kicker="Surveys" />
      <EvidenceHighlight>Survey responses can become evidence or Findings, never VOC.</EvidenceHighlight>
      <button className="primary-inline" type="button">
        Create Finding
      </button>
    </section>
  );
}

function MyWorkPage() {
  return (
    <section className="page">
      <PageHeader title="My Work" kicker="Assigned" />
      <PermissionBlockedPanel summary="Some linked work is summary-visible only in your current scope." />
    </section>
  );
}
