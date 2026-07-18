import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import type { CheckService, Decision } from '../permissions/check-service.js';
import { actorScopeForCapability, type Scope, type ScopeActorContext } from '../permissions/scope-service.js';

export type SurveyAuthorizationActor = ScopeActorContext;

export async function actorSurveyReadScope(db: Db | Tx, actor: SurveyAuthorizationActor): Promise<Scope> {
  if (actor.role_level === 'admin') return { kind: 'all' };
  return actorScopeForCapability(db, actor, 'survey.read');
}

export function isSurveyInReadScope(scope: Scope, managedSystemId: string): boolean {
  return scope.kind === 'all' || scope.managedSystemIds.includes(managedSystemId);
}

const denied: Decision = { allow: false, reason: 'no_grant', requestable: null };

export async function checkSurveyRead(
  checkService: CheckService, actor: SurveyAuthorizationActor, managedSystemId: string,
  options?: Parameters<CheckService['checkCapability']>[3],
): Promise<Decision> {
  if (actor.role_level === 'admin') return { allow: true, via: 'role' };
  return checkService.checkCapability(actor, 'survey.read', {
    workspace_id: actor.workspace_id, managed_system_id: managedSystemId,
  }, options);
}

export async function checkSurveyManage(
  checkService: CheckService, actor: SurveyAuthorizationActor, managedSystemId: string,
  options?: Parameters<CheckService['checkCapability']>[3],
): Promise<Decision> {
  if (actor.role_level === 'admin') return { allow: true, via: 'role' };
  return checkService.checkCapability(actor, 'survey.manage', {
    workspace_id: actor.workspace_id, managed_system_id: managedSystemId,
  }, options);
}

/** Deliberately no admin shortcut: personal data needs an explicit grant. */
export async function checkSurveyPersonalResponseRead(
  checkService: CheckService, actor: SurveyAuthorizationActor, managedSystemId: string,
  options?: Parameters<CheckService['checkCapability']>[3],
): Promise<Decision> {
  if (!managedSystemId) return denied;
  return checkService.checkCapability(actor, 'survey.read_personal_responses', {
    workspace_id: actor.workspace_id, managed_system_id: managedSystemId,
  }, options);
}
