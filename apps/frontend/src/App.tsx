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
const actors = [
  { role: "Admin", actorId: "admin" },
  { role: "Developer", actorId: "dev-tableau" },
  { role: "User", actorId: "user-tableau" }
] as const;

type ActorId = (typeof actors)[number]["actorId"];

const internalExecutionBlockedSummary = "Internal execution actions require Developer or Admin access.";

function canUseInternalExecution(actorId: ActorId) {
  return actorId !== "user-tableau";
}

interface ManagedSystemDto {
  id: string;
  name: string;
}

interface AnalyticsAreaDto {
  id: string;
  managed_system_id: string;
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
  owner_id?: string;
}

interface FindingDto {
  id: string;
  managed_system_id: string;
  title: string;
  summary: string;
  status: string;
}

interface TaskRequestDto {
  id: string;
  managed_system_id: string;
  title: string;
  status: string;
  source_type: string;
  source_id: string;
  requested_by_id: string;
}

interface TaskDto {
  id: string;
  managed_system_id: string;
  title: string;
  status: string;
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

class ApiError extends Error {
  status: number;
  code?: string;

  constructor(path: string, status: number, message: string, code?: string) {
    super(message || `GET ${path} failed with ${status}`);
    this.status = status;
    this.code = code;
  }
}

async function parseApiError(response: Response, path: string, method: string) {
  let message = `${method} ${path} failed with ${response.status}`;
  let code: string | undefined;
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    message = body.error?.message ?? message;
    code = body.error?.code;
  } catch {
    // Keep the standard method/path/status message when the response has no JSON error body.
  }
  return new ApiError(path, response.status, message, code);
}

async function apiGet<T>(path: string, actorId: ActorId): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { headers: { "x-actor-id": actorId } });
  if (!response.ok) {
    throw await parseApiError(response, path, "GET");
  }
  return response.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: Record<string, unknown>, actorId: ActorId): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-actor-id": actorId },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw await parseApiError(response, path, "POST");
  }
  return response.json() as Promise<T>;
}

async function apiPatch<T>(path: string, body: Record<string, unknown>, actorId: ActorId): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-actor-id": actorId },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw await parseApiError(response, path, "PATCH");
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
  const [selectedFindingId, setSelectedFindingId] = useState(route.params.get("selected") ?? "");
  const [selectedTaskRequestId, setSelectedTaskRequestId] = useState(route.params.get("selected") ?? "");
  const [actorId, setActorId] = useState<ActorId>("admin");
  const role = actors.find((actor) => actor.actorId === actorId)?.role ?? "Admin";

  function setSelectedUrlState(kind: "vocs" | "findings" | "task-requests", id: string) {
    if (kind === "vocs") setSelectedVocId(id);
    if (kind === "findings") setSelectedFindingId(id);
    if (kind === "task-requests") setSelectedTaskRequestId(id);
    if (initialPath || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("selected", id);
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>FeedbackOps</strong>
          <span>{role}</span>
        </div>
        <label className="role-switcher">
          <span>Role Level</span>
          <select aria-label="Role Level" value={actorId} onChange={(event) => setActorId(event.target.value as ActorId)}>
            {actors.map((actor) => (
              <option key={actor.actorId} value={actor.actorId}>
                {actor.role}
              </option>
            ))}
          </select>
        </label>
        <nav aria-label="Primary">
          {navItems.map(({ label, href, icon: Icon }) => (
            <a key={label} href={href}>
              <Icon aria-hidden="true" size={16} />
              {label}
            </a>
          ))}
        </nav>
      </aside>
      <main className="main-region">{renderRoute(route, { selectedVocId, selectedFindingId, selectedTaskRequestId }, setSelectedUrlState, actorId)}</main>
    </div>
  );
}

function renderRoute(
  route: { pathname: string; params: URLSearchParams },
  selected: { selectedVocId: string; selectedFindingId: string; selectedTaskRequestId: string },
  setSelectedUrlState: (kind: "vocs" | "findings" | "task-requests", id: string) => void,
  actorId: ActorId
) {
  const { pathname, params } = route;
  if (pathname.startsWith("/vocs")) {
    return <VocPage selectedVocId={selected.selectedVocId} setSelectedVocId={(id) => setSelectedUrlState("vocs", id)} actorId={actorId} />;
  }
  if (pathname.startsWith("/integration")) {
    return <IntegrationPage selectedFindingId={selected.selectedFindingId || params.get("selected") || ""} setSelectedFindingId={(id) => setSelectedUrlState("findings", id)} actorId={actorId} />;
  }
  if (pathname.startsWith("/tasks")) {
    return <TasksPage selectedTaskRequestId={selected.selectedTaskRequestId || params.get("selected") || ""} setSelectedTaskRequestId={(id) => setSelectedUrlState("task-requests", id)} actorId={actorId} />;
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
  return <HomePage actorId={actorId} />;
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

function HomePage({ actorId }: { actorId: ActorId }) {
  const [queues, setQueues] = useState<DashboardQueuesDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    apiGet<DashboardQueuesDto>("/dashboard/action-queues", actorId)
      .then((nextQueues) => {
        setQueues(nextQueues);
        setError(null);
      })
      .catch((caught: unknown) => {
        setQueues(null);
        setError(caught instanceof Error ? caught.message : "Failed to load dashboard");
      });
  }, [actorId]);

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
  setSelectedVocId,
  actorId
}: {
  selectedVocId: string;
  setSelectedVocId: (id: string) => void;
  actorId: ActorId;
}) {
  const [vocs, setVocs] = useState<VocDto[]>([]);
  const [managedSystems, setManagedSystems] = useState<ManagedSystemDto[]>([]);
  const [analyticsAreas, setAnalyticsAreas] = useState<AnalyticsAreaDto[]>([]);
  const [managedSystemId, setManagedSystemId] = useState("ms-tableau");
  const [analyticsAreaId, setAnalyticsAreaId] = useState("aa-tableau-exec");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [publicUpdate, setPublicUpdate] = useState("");
  const [reporterReply, setReporterReply] = useState("");
  const [internalComment, setInternalComment] = useState("");
  const [findingTitle, setFindingTitle] = useState("");
  const [findingSummary, setFindingSummary] = useState("");
  const [createdFinding, setCreatedFinding] = useState<FindingDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadVocs = useCallback(async (preferredSelectedId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const [nextVocs, nextManagedSystems] = await Promise.all([
        apiGet<VocDto[]>(`/vocs?managed_system_id=${managedSystemId}`, actorId),
        apiGet<ManagedSystemDto[]>("/managed-systems", actorId)
      ]);
      setVocs(nextVocs);
      setManagedSystems(nextManagedSystems);
      const nextSelectedId = preferredSelectedId && nextVocs.some((voc) => voc.id === preferredSelectedId)
        ? preferredSelectedId
        : nextVocs.some((voc) => voc.id === selectedVocId)
          ? selectedVocId
          : nextVocs[0]?.id ?? "";
      setSelectedVocId(nextSelectedId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load VOCs");
      setVocs([]);
      setSelectedVocId("");
    } finally {
      setLoading(false);
    }
  }, [actorId, managedSystemId, selectedVocId, setSelectedVocId]);

  useEffect(() => {
    void loadVocs();
  }, [loadVocs]);

  useEffect(() => {
    apiGet<AnalyticsAreaDto[]>(`/analytics-areas?managed_system_id=${managedSystemId}`, actorId)
      .then((areas) => {
        setAnalyticsAreas(areas);
        setAnalyticsAreaId(areas[0]?.id ?? "");
      })
      .catch(() => setAnalyticsAreas([]));
  }, [actorId, managedSystemId]);

  async function submitVoc(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    try {
      const created = await apiPost<VocDto>(
        "/vocs",
        {
          managed_system_id: managedSystemId,
          analytics_area_id: analyticsAreaId || undefined,
          title,
          description
        },
        actorId
      );
      setTitle("");
      setDescription("");
      await loadVocs(created.id);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Failed to submit VOC");
    }
  }

  async function saveTriage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const updated = await apiPatch<VocDto>(
      `/vocs/${selected.id}`,
      {
        triage_state: form.get("triage_state"),
        severity: form.get("severity"),
        owner_id: form.get("owner_id")
      },
      actorId
    );
    setVocs((current) => current.map((voc) => (voc.id === updated.id ? updated : voc)));
  }

  async function submitConversation(type: "public-updates" | "reporter-replies" | "internal-comments", body: string, clear: () => void) {
    if (!selected || !body) return;
    setActionError(null);
    try {
      await apiPost(`/vocs/${selected.id}/${type}`, { body }, actorId);
      clear();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Failed to submit conversation");
    }
  }

  async function createFinding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const finding = await apiPost<FindingDto>(
      `/vocs/${selected.id}/create-finding`,
      { title: findingTitle || selected.title, summary: findingSummary || selected.description },
      actorId
    );
    setCreatedFinding(finding);
    setFindingTitle("");
    setFindingSummary("");
  }

  const selected = vocs.find((voc) => voc.id === selectedVocId) ?? vocs[0];
  const systemName = (id: string) => managedSystems.find((system) => system.id === id)?.name ?? id;
  const canUseExecutionControls = canUseInternalExecution(actorId);

  return (
    <section className="page split-page">
      <div className="list-region">
        <PageHeader title="VOC Inbox" kicker="VOC" />
        <form className="inline-create" onSubmit={submitVoc}>
          <label>
            <span>Managed System</span>
            <select aria-label="Managed System" value={managedSystemId} onChange={(event) => setManagedSystemId(event.target.value)}>
              {managedSystems.map((system) => (
                <option key={system.id} value={system.id}>
                  {system.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Analytics Area</span>
            <select aria-label="Analytics Area" value={analyticsAreaId} onChange={(event) => setAnalyticsAreaId(event.target.value)}>
              {analyticsAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </label>
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
        {actionError ? <div className="fo-empty">{actionError}</div> : null}
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
          {canUseExecutionControls ? (
            <form className="control-grid" onSubmit={saveTriage}>
              <label>
                <span>Triage state</span>
                <select aria-label="Triage state" name="triage_state" defaultValue={selected.triage_state} key={`${selected.id}-triage`}>
                  <option value="new">new</option>
                  <option value="triaging">triaging</option>
                  <option value="triaged">triaged</option>
                </select>
              </label>
              <label>
                <span>Severity</span>
                <select aria-label="Severity" name="severity" defaultValue={selected.severity ?? "medium"} key={`${selected.id}-severity`}>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="critical">critical</option>
                </select>
              </label>
              <label>
                <span>Owner</span>
                <select aria-label="Owner" name="owner_id" defaultValue={selected.owner_id ?? "dev-tableau"} key={`${selected.id}-owner`}>
                  <option value="dev-tableau">dev-tableau</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <button className="primary-inline" type="submit">
                Save triage
              </button>
            </form>
          ) : (
            <PermissionBlockedPanel summary={internalExecutionBlockedSummary} />
          )}
          {canUseExecutionControls ? <LinkedEntityTrail links={["VOC", "Finding candidate", "Task Request candidate"]} /> : null}
          <div className="composer-grid">
            {canUseExecutionControls ? (
              <div>
                <RichContentEditor label="Public Update" value={publicUpdate} onChange={setPublicUpdate} />
                <button className="primary-inline" type="button" onClick={() => void submitConversation("public-updates", publicUpdate, () => setPublicUpdate(""))}>
                  Post Public Update
                </button>
              </div>
            ) : null}
            <div>
              <RichContentEditor label="Reporter Reply" value={reporterReply} onChange={setReporterReply} />
              <button className="primary-inline" type="button" onClick={() => void submitConversation("reporter-replies", reporterReply, () => setReporterReply(""))}>
                Post Reporter Reply
              </button>
            </div>
            {canUseExecutionControls ? (
              <div>
                <RichContentEditor label="Internal Comment" value={internalComment} onChange={setInternalComment} />
                <button className="primary-inline" type="button" onClick={() => void submitConversation("internal-comments", internalComment, () => setInternalComment(""))}>
                  Post Internal Comment
                </button>
              </div>
            ) : null}
          </div>
          {canUseExecutionControls ? (
            <form className="control-grid" onSubmit={createFinding}>
              <label>
                <span>Finding title</span>
                <input aria-label="Finding title" value={findingTitle} onChange={(event) => setFindingTitle(event.target.value)} />
              </label>
              <label>
                <span>Finding summary</span>
                <textarea aria-label="Finding summary" value={findingSummary} onChange={(event) => setFindingSummary(event.target.value)} />
              </label>
              <button className="primary-inline" type="submit">
                Create Finding
              </button>
              {createdFinding ? <EvidenceHighlight>{createdFinding.title}</EvidenceHighlight> : null}
            </form>
          ) : null}
        </DetailPanel>
      ) : (
        <DetailPanel title="VOC detail">
          <div className="fo-empty">Select a VOC</div>
        </DetailPanel>
      )}
    </section>
  );
}

function IntegrationPage({
  selectedFindingId,
  setSelectedFindingId,
  actorId
}: {
  selectedFindingId: string;
  setSelectedFindingId: (id: string) => void;
  actorId: ActorId;
}) {
  const [findings, setFindings] = useState<FindingDto[]>([]);
  const [taskRequestTitle, setTaskRequestTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionBlocked, setPermissionBlocked] = useState<string | null>(null);
  const canUseExecutionControls = canUseInternalExecution(actorId);

  const loadFindings = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPermissionBlocked(canUseExecutionControls ? null : internalExecutionBlockedSummary);
    try {
      const nextFindings = await apiGet<FindingDto[]>("/findings", actorId);
      setFindings(nextFindings);
      setPermissionBlocked(null);
      if (!selectedFindingId && nextFindings[0]) setSelectedFindingId(nextFindings[0].id);
      if (selectedFindingId && !nextFindings.some((finding) => finding.id === selectedFindingId)) {
        setSelectedFindingId(nextFindings[0]?.id ?? "");
      }
    } catch (caught) {
      setFindings([]);
      setSelectedFindingId("");
      if (caught instanceof ApiError && caught.code === "permission_denied") {
        setPermissionBlocked(caught.message);
      } else {
        setError(caught instanceof Error ? caught.message : "Failed to load Findings");
      }
    } finally {
      setLoading(false);
    }
  }, [actorId, canUseExecutionControls, selectedFindingId, setSelectedFindingId]);

  useEffect(() => {
    void loadFindings();
  }, [loadFindings]);

  const selected = findings.find((finding) => finding.id === selectedFindingId) ?? findings[0];

  async function requestTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    await apiPost(`/findings/${selected.id}/request-task`, { title: taskRequestTitle || selected.title }, actorId);
    setTaskRequestTitle("");
  }

  return (
    <section className="page split-page">
      <div className="list-region">
        <PageHeader title="Findings" kicker="Integration" />
        {loading ? <div className="fo-empty">Loading</div> : null}
        {error ? <div className="fo-empty">{error}</div> : null}
        {permissionBlocked ? <PermissionBlockedPanel summary={permissionBlocked} /> : null}
        {!permissionBlocked && !loading && !error ? (
          <ObjectList
            items={findings.map((finding) => ({ id: finding.id, title: finding.title, meta: finding.status }))}
            selectedId={selected?.id}
            onSelect={setSelectedFindingId}
          />
        ) : null}
      </div>
      {selected ? (
        <DetailPanel title={selected.title}>
          <p>{selected.summary}</p>
          <StatusBadge family="finding" value={selected.status} />
          {canUseExecutionControls ? (
            <form className="control-grid" onSubmit={requestTask}>
              <label>
                <span>Task Request title</span>
                <input aria-label="Task Request title" value={taskRequestTitle} onChange={(event) => setTaskRequestTitle(event.target.value)} />
              </label>
              <button className="primary-inline" type="submit">
                Request Task
              </button>
            </form>
          ) : (
            <PermissionBlockedPanel summary={permissionBlocked ?? internalExecutionBlockedSummary} />
          )}
        </DetailPanel>
      ) : permissionBlocked ? (
        <DetailPanel title="Findings">
          <PermissionBlockedPanel summary={permissionBlocked} />
        </DetailPanel>
      ) : (
        <DetailPanel title="Restricted finding" permissionBlocked summary="Summary visible to reporter">
          Private root-cause notes
        </DetailPanel>
      )}
    </section>
  );
}

function TasksPage({
  selectedTaskRequestId,
  setSelectedTaskRequestId,
  actorId
}: {
  selectedTaskRequestId: string;
  setSelectedTaskRequestId: (id: string) => void;
  actorId: ActorId;
}) {
  const [taskRequests, setTaskRequests] = useState<TaskRequestDto[]>([]);
  const [tasks, setTasks] = useState<TaskDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionBlocked, setPermissionBlocked] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPermissionBlocked(null);
    try {
      const [nextTaskRequests, nextTasks] = await Promise.all([apiGet<TaskRequestDto[]>("/task-requests", actorId), apiGet<TaskDto[]>("/tasks", actorId)]);
      setTaskRequests(nextTaskRequests);
      setTasks(nextTasks);
      if (!selectedTaskRequestId && nextTaskRequests[0]) setSelectedTaskRequestId(nextTaskRequests[0].id);
      if (selectedTaskRequestId && !nextTaskRequests.some((request) => request.id === selectedTaskRequestId)) {
        setSelectedTaskRequestId(nextTaskRequests[0]?.id ?? "");
      }
    } catch (caught) {
      setTaskRequests([]);
      setTasks([]);
      setSelectedTaskRequestId("");
      if (caught instanceof ApiError && caught.code === "permission_denied") {
        setPermissionBlocked(caught.message);
      } else {
        setError(caught instanceof Error ? caught.message : "Failed to load Tasks");
      }
    } finally {
      setLoading(false);
    }
  }, [actorId, selectedTaskRequestId, setSelectedTaskRequestId]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const selected = taskRequests.find((request) => request.id === selectedTaskRequestId) ?? taskRequests[0];

  async function review(path: string) {
    if (!selected) return;
    await apiPost(`/task-requests/${selected.id}/${path}`, { reason: "Reviewed from Tasks intake." }, actorId);
    await loadTasks();
  }

  return (
    <section className="page split-page">
      <div className="list-region">
        <PageHeader title="Tasks" kicker="Tasks" />
        {loading ? <div className="fo-empty">Loading</div> : null}
        {error ? <div className="fo-empty">{error}</div> : null}
        {permissionBlocked ? <PermissionBlockedPanel summary={permissionBlocked} /> : null}
        {!permissionBlocked && !loading && !error ? (
          <ObjectList
            items={taskRequests.map((request) => ({ id: request.id, title: request.title, meta: request.status }))}
            selectedId={selected?.id}
            onSelect={setSelectedTaskRequestId}
          />
        ) : null}
        <div className="task-board">
          <section>
            <h2>Backlog</h2>
            {tasks.length === 0 ? <p>No converted Tasks</p> : null}
            {tasks.map((task) => (
              <div key={task.id} className="task-row">
                <strong>{task.title}</strong>
                <StatusBadge family="task" value={task.status} />
              </div>
            ))}
          </section>
        </div>
      </div>
      <DetailPanel title={selected?.title ?? "Task Request"}>
        {permissionBlocked ? (
          <PermissionBlockedPanel summary={permissionBlocked} />
        ) : selected ? (
          <>
            <StatusBadge family="task-request" value={selected.status} />
            <div className="action-strip">
              <button className="primary-inline" type="button" onClick={() => void review("approve")}>
                Approve
              </button>
              <button className="primary-inline" type="button" onClick={() => void review("reject")}>
                Reject
              </button>
              <button className="primary-inline" type="button" onClick={() => void review("request-more-evidence")}>
                Request more evidence
              </button>
              <button className="primary-inline" type="button" onClick={() => void review("convert-to-task")}>
                Convert to Task
              </button>
            </div>
          </>
        ) : (
          <div className="fo-empty">No Task Requests</div>
        )}
      </DetailPanel>
    </section>
  );
}

function AdminPage() {
  const [managedSystems, setManagedSystems] = useState<ManagedSystemDto[]>([]);

  useEffect(() => {
    apiGet<ManagedSystemDto[]>("/managed-systems", "admin").then(setManagedSystems).catch(() => setManagedSystems([]));
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
