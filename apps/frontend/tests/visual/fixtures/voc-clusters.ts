import {
  type AddVocClusterMemberRequest,
  type FindingDto,
  type LinkExistingFindingToVocClusterRequest,
  type ListSameManagedSystemCandidatePeersResponse,
  type ListVocClustersResponse,
  type VocClusterDto,
  addVocClusterMemberRequestSchema,
  findingDtoSchema,
  linkExistingFindingToVocClusterRequestSchema,
  listSameManagedSystemCandidatePeersResponseSchema,
  listVocClustersResponseSchema,
  vocClusterDtoSchema,
} from '@fops/shared';

export const IDS = {
  workspace: '11111111-1111-4111-8111-111111111111',
  actor: '22222222-2222-4222-8222-222222222222',
  managedSystem: '33333333-3333-4333-8333-333333333333',
  draft: '44444444-4444-4444-8444-444444444444',
  linked: '55555555-5555-4555-8555-555555555555',
  confirmedNoFinding: '66666666-6666-4666-8666-666666666666',
  existingVoc: '77777777-7777-4777-8777-777777777777',
  candidateVoc: '88888888-8888-4888-8888-888888888888',
  finding: '99999999-9999-4999-8999-999999999999',
} as const;

const dates = {
  created: '2026-01-15T09:00:00.000Z',
  updated: '2026-01-16T10:30:00.000Z',
  confirmed: '2026-01-16T08:00:00.000Z',
  added: '2026-01-15T10:00:00.000Z',
  candidateAdded: '2026-01-17T11:00:00.000Z',
} as const;

const member = {
  voc_id: IDS.existingVoc,
  added_by: IDS.actor,
  added_at: dates.added,
  display_id: 'VOC-101',
  title: '로그인 세션이 자주 만료됩니다',
  severity: 'high',
  reporter_facing_status: 'reviewing',
} as const;

export const candidatePeer = {
  voc_id: IDS.candidateVoc,
  display_id: 'VOC-102',
  title: '인증 후 화면이 반복해서 새로고침됩니다',
  severity: 'medium',
  reporter_facing_status: 'received',
} as const;

export const existingFinding: FindingDto = findingDtoSchema.parse({
  id: IDS.finding,
  workspace_id: IDS.workspace,
  display_id: 'FND-201',
  primary_managed_system_id: IDS.managedSystem,
  title: '인증 흐름 안정화',
  summary: '인증 오류 반복 패턴을 해결합니다.',
  source_type: 'manual',
  source_id: null,
  evidence_count: 0,
  severity: 'high',
  confidence: 'high',
  status: 'active',
  analytics_area_id: null,
  linked_task_id: null,
  linked_milestone_id: null,
  created_by: IDS.actor,
  created_at: dates.created,
  updated_at: dates.updated,
});

export const linkExistingFindingRequest: LinkExistingFindingToVocClusterRequest =
  linkExistingFindingToVocClusterRequestSchema.parse({
    finding_id: IDS.finding,
  });

function cluster(overrides: Partial<VocClusterDto>): VocClusterDto {
  return vocClusterDtoSchema.parse({
    id: IDS.draft,
    workspace_id: IDS.workspace,
    display_id: 'VCL-001',
    title: '인증 흐름 불안정',
    summary: '로그인과 세션 유지 과정에서 반복되는 사용자 문제입니다.',
    severity: 'high',
    confidence: 'high',
    rationale: '동일 Managed System의 VOC를 묶었습니다.',
    owner_user_id: IDS.actor,
    status: 'draft',
    primary_managed_system_id: IDS.managedSystem,
    created_by: IDS.actor,
    confirmed_by: null,
    confirmed_at: null,
    created_at: dates.created,
    updated_at: dates.updated,
    member_count: 1,
    members: [member],
    linked_findings: [],
    ...overrides,
  });
}

export const draftNoFinding = cluster({});

// Deliberately schema-valid: linkedFindingDtoSchema has no title field.
export const confirmedLinkedFinding = cluster({
  id: IDS.linked,
  display_id: 'VCL-002',
  title: '인증 오류 패턴',
  status: 'confirmed',
  confirmed_by: IDS.actor,
  confirmed_at: dates.confirmed,
  linked_findings: [{ id: IDS.finding, display_id: 'FND-201', status: 'active' }],
});

export const confirmedNoFinding = cluster({
  id: IDS.confirmedNoFinding,
  display_id: 'VCL-003',
  title: '초대 메일 지연',
  status: 'confirmed',
  confirmed_by: IDS.actor,
  confirmed_at: dates.confirmed,
  members: [],
  member_count: 0,
  linked_findings: [],
});

export const populatedList: ListVocClustersResponse = listVocClustersResponseSchema.parse({
  items: [confirmedNoFinding, confirmedLinkedFinding, draftNoFinding],
});

export const emptyList: ListVocClustersResponse = listVocClustersResponseSchema.parse({
  items: [],
});

export const candidatePeers: ListSameManagedSystemCandidatePeersResponse =
  listSameManagedSystemCandidatePeersResponseSchema.parse({
    candidate_basis: 'same_managed_system_active_voc',
    candidates: [candidatePeer],
  });

export const addCandidateRequest: AddVocClusterMemberRequest =
  addVocClusterMemberRequestSchema.parse({ voc_id: IDS.candidateVoc });

export const managedSystems = {
  items: [
    {
      id: IDS.managedSystem,
      workspace_id: IDS.workspace,
      slug: 'identity',
      name: 'Identity Platform',
      external_key: null,
      default_owner_actor_id: null,
      default_owner_team_id: null,
      archived_at: null,
      archived_by_actor_id: null,
      created_at: dates.created,
      updated_at: dates.updated,
    },
  ],
  total: 1,
} as const;

export function memberFromCandidate(): NonNullable<VocClusterDto['members']>[number] {
  return {
    voc_id: candidatePeer.voc_id,
    added_by: IDS.actor,
    added_at: dates.candidateAdded,
    display_id: candidatePeer.display_id,
    title: candidatePeer.title,
    severity: candidatePeer.severity,
    reporter_facing_status: candidatePeer.reporter_facing_status,
  };
}
