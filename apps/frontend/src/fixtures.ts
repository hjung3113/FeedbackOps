export const fixtures = {
  actor: {
    name: "Admin",
    roleLevel: "Admin"
  },
  managedSystems: [
    { id: "ms-tableau", name: "Tableau" },
    { id: "ms-looker", name: "Looker" }
  ],
  vocs: [
    {
      id: "voc-seeded-tableau",
      title: "Seeded Tableau VOC",
      managedSystem: "Tableau",
      reporterStatus: "검토 중",
      triageState: "triaging",
      severity: "medium",
      description: "Dashboard is intermittently slow."
    },
    {
      id: "voc-high-unlinked",
      title: "High severity unlinked VOC",
      managedSystem: "Tableau",
      reporterStatus: "검토 중",
      triageState: "triaged",
      severity: "high",
      description: "Month-end finance dashboard is down."
    }
  ],
  actionQueues: [
    {
      id: "voc-high-unlinked",
      title: "High severity VOC has no linked follow-up",
      reason: "No linked Finding, Task Request, Task, or authorized no-follow-up decision exists.",
      nextAction: "Create Finding or Task Request"
    },
    {
      id: "task-request-1",
      title: "Task Request pending review",
      reason: "Execution candidate needs Admin or same-scope Developer decision.",
      nextAction: "Review Task Request"
    }
  ]
};
