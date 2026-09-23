import type { AnalyticsAreaDto, ResolveActorsResponse } from '../../../lib/api';

export function teamName(
  area: AnalyticsAreaDto,
  resolved: ResolveActorsResponse | undefined,
): string | null {
  if (!area.owner_team_id) return null;
  const t = resolved?.teams.find((x) => x.id === area.owner_team_id);
  return t ? t.name : null;
}
