import { TASK_REQUEST_STATUS_LABELS } from '@/lib/copy/enum-labels';
import { GLOSSARY } from '@/lib/copy/glossary';
import { TASK_REQUEST_REVIEW_DECISION_LABEL } from '@/lib/copy/task-requests';
import type { WorkspaceActor } from '@/lib/cross-system/useWorkspaceActors';
import { formatShortDateTime } from '@/lib/format/datetime';
import type { TaskRequestDto } from '@fops/shared';
import {
  DetailPanelFullscreenContext,
  DetailPanelHeader,
  DetailPanelHeaderActions,
  DetailPanelSectionNav,
  type PanelSection,
  PanelSectionTitle,
  PanelTitleBlock,
} from '@fops/ui';
import * as React from 'react';

import { TaskRequestDecisionDialog } from './TaskRequestDecisionDialog';
import { TaskRequestDecisionSection } from './TaskRequestDecisionSection';
import { TaskRequestOutcomeSection } from './TaskRequestOutcomeSection';
import { TaskRequestPropertiesSection } from './TaskRequestPropertiesSection';
import { type NameMaps, TaskRequestBadge } from './TaskRequestRow';
import { TaskRequestSourceSection } from './TaskRequestSourceSection';
import { useTaskRequestDecision } from './useTaskRequestDecision';
import { useTaskRequestPanelController } from './useTaskRequestPanelController';

// ADR-0057 A2 amendment: keep panel navigation in Korean and preserve domain nouns.
export function buildTaskRequestSections(showDecisionSummary: boolean): PanelSection[] {
  return [
    { id: 'overview', label: '요약' },
    showDecisionSummary
      ? { id: 'outcome', label: '결정 요약' }
      : { id: 'decision', label: TASK_REQUEST_REVIEW_DECISION_LABEL },
    { id: 'source', label: '출처' },
    { id: 'properties', label: '속성' },
    { id: 'audit', label: '이력' },
  ];
}

interface TaskRequestPanelProps {
  item: TaskRequestDto;
  names: NameMaps;
  eligibleActors?: readonly WorkspaceActor[];
  currentActorId: string | null;
  currentRole: string | null;
  onClose: () => void;
  onDecisionComplete?: (item: TaskRequestDto) => void;
  getCompletedFocusTarget?: (result: TaskRequestDto) => HTMLElement | null;
  onDecisionCloseComplete?: () => void;
  decisionRecovery?: React.ReactNode;
}

export function TaskRequestPanel({
  item,
  names,
  eligibleActors = [],
  currentActorId,
  currentRole,
  onClose,
  onDecisionComplete,
  getCompletedFocusTarget,
  onDecisionCloseComplete,
  decisionRecovery,
}: TaskRequestPanelProps) {
  const fullscreen = React.useContext(DetailPanelFullscreenContext);
  const decisionHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const requester = names.actorsById[item.requester_actor_id];
  const reviewer = item.reviewer_actor_id ? names.actorsById[item.reviewer_actor_id] : undefined;

  const decision = useTaskRequestDecision({ item, currentActorId, currentRole });
  const deliveredDecisionResultRef = React.useRef<TaskRequestDto | null>(null);
  React.useEffect(() => {
    const result = decision.result;
    if (result === null || result === deliveredDecisionResultRef.current) return;
    deliveredDecisionResultRef.current = result;
    if (fullscreen?.expanded) fullscreen.toggle();
    onDecisionComplete?.(result);
  }, [decision.result, onDecisionComplete, fullscreen]);

  const { sourceFindingQuery, conversion, link, resultingTask, taskForOutcome } =
    useTaskRequestPanelController({ item, currentRole });
  const showDecisionSummary = item.status === 'converted' || item.status === 'rejected';
  // Known-team candidates for the conversion form's team picker: the Managed
  // System defaults plus every team the queue context already names (ADR-0067).
  const conversionTeamCandidates = [
    ...new Set(
      [
        names.managedSystemsById[item.primary_managed_system_id]?.defaultReviewerTeamId,
        names.managedSystemsById[item.primary_managed_system_id]?.defaultOwnerTeamId,
        ...Object.keys(names.teamsById ?? {}),
      ].filter((id): id is string => id !== undefined),
    ),
  ];
  const sections = buildTaskRequestSections(showDecisionSummary);

  // Task Request has no impact field; omit the prototype's status-derived row (#585).
  return (
    <aside className="flex h-full flex-col bg-surface-detail">
      <DetailPanelHeader
        kind="task_request"
        id={item.display_id}
        onClose={onClose}
        extras={
          <DetailPanelHeaderActions
            entityKind="task"
            entityId={item.id}
            copyUrl={`/tasks?view=requests&param=${item.id}`}
          />
        }
      />
      <DetailPanelSectionNav sections={sections} scrollRef={scrollRef} />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div data-anchor="overview">
          <PanelTitleBlock
            title={item.requested_outcome}
            badges={
              <>
                <TaskRequestBadge status={item.status} />
                <span className="text-xs text-text-muted">
                  · {GLOSSARY.requestedBy}{' '}
                  <strong className="text-text-secondary">
                    {requester?.display_name ?? GLOSSARY.unknownUser}
                  </strong>
                </span>
                <span className="text-xs text-text-muted">
                  · {formatShortDateTime(item.created_at)}
                </span>
              </>
            }
          />
        </div>

        {showDecisionSummary ? (
          <TaskRequestOutcomeSection
            headingRef={decisionHeadingRef}
            item={item}
            reviewerName={reviewer?.display_name}
            taskForOutcome={taskForOutcome}
          />
        ) : (
          <TaskRequestDecisionSection
            headingRef={decisionHeadingRef}
            names={names}
            resultingTask={resultingTask}
            decision={decision}
            conversion={conversion}
            link={link}
            teamCandidates={conversionTeamCandidates}
            eligibleActors={eligibleActors}
          />
        )}

        <TaskRequestSourceSection item={item} sourceFinding={sourceFindingQuery.data} />

        <TaskRequestPropertiesSection
          item={item}
          names={names}
          reviewer={reviewer}
          {...(conversion.canAssign === undefined ? {} : { canAssign: conversion.canAssign })}
        />

        <section data-anchor="audit" className="border-t border-border-subtle px-4 py-4">
          <PanelSectionTitle>이력</PanelSectionTitle>
          <div className="flex flex-col gap-2 border-l border-border-subtle pl-3">
            <div className="text-xs text-text-muted">
              <strong className="text-text-secondary">
                {requester?.display_name ?? GLOSSARY.unknownUser}
              </strong>
              {' · 요청 작성 · '}
              {formatShortDateTime(item.created_at)}
            </div>
            {item.decided_at && (
              <div className="text-xs text-text-muted">
                <strong className="text-text-secondary">
                  {reviewer?.display_name ?? GLOSSARY.unknownUser}
                </strong>
                {' · '}
                {TASK_REQUEST_STATUS_LABELS[item.status]}
                {' · '}
                {formatShortDateTime(item.decided_at)}
              </div>
            )}
          </div>
        </section>
      </div>
      <TaskRequestDecisionDialog
        key={item.id}
        dialog={decision.dialog}
        completedResult={decision.result}
        getCompletedFocusTarget={
          getCompletedFocusTarget ??
          ((result) =>
            result.id === item.id &&
            result.status === item.status &&
            (result.status === 'approved' ||
              result.status === 'rejected' ||
              result.status === 'needs_more_evidence')
              ? decisionHeadingRef.current
              : null)
        }
        {...(onDecisionCloseComplete ? { onCompletedClose: onDecisionCloseComplete } : {})}
        recovery={decisionRecovery}
        request={item}
        isSelfApproval={decision.isSelfApproval}
        isSubmitting={decision.isSubmitting}
        onChange={decision.changeValue}
        onClose={decision.close}
        onSubmit={decision.submitDecision}
      />
    </aside>
  );
}
