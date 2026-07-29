// Permissions module barrel. External consumers (server.ts wiring, future
// modules that need to assert capability gates) import from here.

export {
  createCheckService,
  type CheckService,
  type CheckServiceDeps,
  type Decision,
  type CapabilityScope,
  type DenyReason,
  type RequestableScope,
  type ActorContext,
  type CheckScope,
} from './check-service.js';
export {
  toFrontendState,
  type FrontendState,
  type OpenRequestSummary,
  type OpenRequestStatus,
} from './state-mapper.js';
export { permissionsRoutes, type PermissionsRoutesOptions } from './routes.js';
export {
  createRequestService,
  type RequestService,
  type CreatePermissionRequestBody,
  type CreatePermissionRequestResult,
} from './request-service.js';
export {
  createDecisionService,
  type DecisionService,
  type DecisionServiceDeps,
  type DecisionOptions,
} from './decision-service.js';
