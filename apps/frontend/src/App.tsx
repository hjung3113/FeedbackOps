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
import { useMemo, useState } from "react";
import { fixtures } from "./fixtures";

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
  const [selectedVocId, setSelectedVocId] = useState(route.params.get("selected") ?? fixtures.vocs[0].id);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>FeedbackOps</strong>
          <span>{fixtures.actor.roleLevel}</span>
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
  return (
    <section className="page">
      <PageHeader title="Action Dashboard" kicker="Home" />
      <div className="queue-stack">
        {fixtures.actionQueues.map((row) => (
          <ActionQueueRow key={row.id} title={row.title} reason={row.reason} nextAction={row.nextAction} />
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
  const selected = fixtures.vocs.find((voc) => voc.id === selectedVocId) ?? fixtures.vocs[0];
  return (
    <section className="page split-page">
      <div className="list-region">
        <PageHeader title="VOC Inbox" kicker="VOC" />
        <ObjectList
          items={fixtures.vocs.map((voc) => ({
            id: voc.id,
            title: voc.title,
            meta: `${voc.managedSystem} · ${voc.severity}`,
            signal: voc.triageState
          }))}
          selectedId={selected.id}
          onSelect={setSelectedVocId}
        />
      </div>
      <DetailPanel title={selected.title}>
        <div className="detail-grid">
          <div>
            <span className="field-label">Reporter status</span>
            <StatusBadge family="reporter-voc" value={selected.reporterStatus} />
          </div>
          <div>
            <span className="field-label">Internal triage</span>
            <SignalBadge value={selected.triageState} urgent={selected.severity === "high"} />
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
  return (
    <section className="page">
      <PageHeader title="Managed Systems" kicker="Admin" />
      <ObjectList
        items={fixtures.managedSystems.map((system) => ({ id: system.id, title: system.name, meta: "Active" }))}
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
