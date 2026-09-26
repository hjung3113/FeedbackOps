import { ListShell } from '@fops/ui';

// #514 B2a — route mount only: /tasks?view=milestones renders the list shell.
// B2c fills the toolbar (tabs All/In progress/Planning/Released, search,
// Filter, New milestone), the summary strip, and MilestoneRow rows; the
// detail panel and Slice C (mini timeline, Gantt) stay out of this slice.
// Selection rides `param` like every shipped Task view (design §7 item 8);
// there is no `selected` key on /tasks.
export interface MilestonesRouteProps {
  selectedParam?: string | undefined;
  managedSystem?: string;
}

export function MilestonesRoute(_props: MilestonesRouteProps) {
  return <ListShell list={null} />;
}
