#!/usr/bin/env node
// One [preview] record per drawer surface on a throwaway preview database.
// Task Request is the exception: one converted, one left pending_review.
//
// Idempotent: each record's title (or the request's reason / evidence summary)
// starts with "[preview]". The matching list is read before every create.
//
// Mutations share a 10/minute actor bucket
// (apps/backend/src/lib/rate-limit-tiers.ts). Writes are split across personas
// so one start stays under that cap. Approve of a permission request uses the
// separate sensitive bucket.
//
// The outcome follow-up review renders a row only when the survey is closed,
// the response count meets the anonymity threshold (minimum 5, core.md), and
// the reader holds survey.read_personal_responses. Admin does not bypass that
// capability (packages/shared/src/enums/capabilities.ts).

import { randomUUID } from 'node:crypto';

const MARK = '[preview]';
const PERSONAS = [
  'mock-admin-1',
  'mock-admin-2',
  'mock-developer-1',
  'mock-developer-2',
  'mock-user-1',
  'mock-user-2',
];

const TITLE = {
  finding: `${MARK} Finding from a seed VOC`,
  taskRequest: `${MARK} evidence for the preview task request`,
  taskRequestPending: `${MARK} pending task request for the review drawer`,
  task: `${MARK} Task from the finding`,
  milestone: `${MARK} Milestone for the preview task`,
  cluster: `${MARK} VOC Cluster`,
  discovery: `${MARK} Discovery survey`,
  outcome: `${MARK} Outcome survey`,
  permission: `${MARK} permission request for the review drawer`,
  personalRead: `${MARK} personal response read for the follow-up review`,
};

const DRY_RUN_STEPS = [
  { step: 'finding', method: 'POST', path: '/vocs/:id/create-finding', persona: 'mock-admin-1' },
  {
    step: 'task_request',
    method: 'POST',
    path: '/findings/:id/request-task',
    persona: 'mock-admin-1',
  },
  { step: 'task', method: 'POST', path: '/task-requests/:id/approve', persona: 'mock-admin-1' },
  { step: 'task', method: 'POST', path: '/task-requests/:id/convert', persona: 'mock-admin-1' },
  {
    step: 'task_request_pending',
    method: 'POST',
    path: '/findings/:id/request-task',
    persona: 'mock-admin-1',
  },
  { step: 'milestone', method: 'POST', path: '/milestones', persona: 'mock-admin-1' },
  { step: 'milestone', method: 'POST', path: '/tasks/:id/milestone', persona: 'mock-admin-1' },
  { step: 'voc_cluster', method: 'POST', path: '/voc-clusters', persona: 'mock-developer-1' },
  {
    step: 'voc_cluster',
    method: 'POST',
    path: '/voc-clusters/:id/vocs',
    persona: 'mock-developer-1',
  },
  { step: 'discovery_survey', method: 'POST', path: '/surveys', persona: 'mock-developer-2' },
  {
    step: 'discovery_survey',
    method: 'POST',
    path: '/surveys/:id/questions',
    persona: 'mock-developer-2',
  },
  {
    step: 'discovery_survey',
    method: 'POST',
    path: '/surveys/:id/open',
    persona: 'mock-developer-2',
  },
  {
    step: 'discovery_response',
    method: 'POST',
    path: '/surveys/:id/responses',
    persona: 'mock-user-1',
  },
  { step: 'outcome_survey', method: 'POST', path: '/surveys', persona: 'mock-developer-2' },
  {
    step: 'outcome_survey',
    method: 'POST',
    path: '/surveys/:id/questions',
    persona: 'mock-developer-2',
  },
  {
    step: 'outcome_survey',
    method: 'POST',
    path: '/surveys/:id/open',
    persona: 'mock-developer-2',
  },
  {
    step: 'outcome_response',
    method: 'POST',
    path: '/surveys/:id/responses',
    persona: 'mock-user-1',
  },
  {
    step: 'outcome_follow_up',
    method: 'POST',
    path: '/surveys/:id/responses',
    persona: 'mock-user-2',
  },
  {
    step: 'outcome_follow_up',
    method: 'POST',
    path: '/surveys/:id/responses',
    persona: 'mock-admin-2',
  },
  {
    step: 'outcome_follow_up',
    method: 'POST',
    path: '/surveys/:id/responses',
    persona: 'mock-developer-1',
  },
  {
    step: 'outcome_follow_up',
    method: 'POST',
    path: '/surveys/:id/responses',
    persona: 'mock-developer-2',
  },
  {
    step: 'outcome_follow_up',
    method: 'POST',
    path: '/surveys/:id/close',
    persona: 'mock-developer-2',
  },
  {
    step: 'outcome_follow_up',
    method: 'POST',
    path: '/permission-requests',
    persona: 'mock-admin-1',
  },
  {
    step: 'outcome_follow_up',
    method: 'POST',
    path: '/permissions/requests/:id/approve',
    persona: 'mock-admin-2',
  },
  {
    step: 'permission_request',
    method: 'POST',
    path: '/permission-requests',
    persona: 'mock-user-2',
  },
];

const created = {};
const reused = [];
const failed = [];
const sessions = {};
let origin = 'http://127.0.0.1';

function parseArgs(argv) {
  let api = '';
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--api') {
      api = argv[i + 1] ?? '';
      i += 1;
    } else if (arg.startsWith('--api=')) api = arg.slice('--api='.length);
    else return { error: `unknown argument ${arg}` };
  }
  if (!api) return { error: 'missing --api http://127.0.0.1:<port>' };
  let url;
  try {
    url = new URL(api);
  } catch {
    return { error: `invalid --api ${api}` };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { error: `invalid --api ${api}` };
  }
  return { api: url.origin, dryRun };
}

function finish(payload, code = 0) {
  console.log(JSON.stringify(payload));
  process.exit(code);
}

async function guard(step, fn) {
  try {
    return await fn();
  } catch {
    recordFailed(step, 0, 'script_error');
    return null;
  }
}

function refOf(row) {
  return { id: row?.id ?? null, display_id: row?.display_id ?? null };
}

function remember(kind, row, wasCreated) {
  const ref = refOf(row);
  if (wasCreated) created[kind] = ref;
  else reused.push({ kind, ...ref });
  return ref;
}

function recordFailed(step, status, code) {
  failed.push({ step, status, code: code || 'unknown' });
}

function isRedirectRefusal(error) {
  let current = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (current.message === 'unexpected redirect') return true;
    current = current.cause;
  }
  return false;
}

function itemsOf(body) {
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.items)) return body.items;
  if (body && Array.isArray(body.requests)) return body.requests;
  return [];
}

function marked(value) {
  return typeof value === 'string' && value.startsWith(MARK);
}

function findMarked(rows, field, exact) {
  const hits = rows.filter((row) => marked(row?.[field]));
  return hits.find((row) => row[field] === exact) ?? hits[0] ?? null;
}

async function request(path, { method = 'GET', persona, body, query, idempotency, ifMatch } = {}) {
  const headers = { accept: 'application/json' };
  if (persona) {
    const session = sessions[persona];
    if (!session) return { ok: false, status: 0, code: 'not_logged_in', body: null };
    headers.cookie = session.cookie;
  }
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (idempotency) headers['idempotency-key'] = randomUUID();
  if (ifMatch) headers['if-match'] = ifMatch;
  const url = new URL(path, `${origin}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  }
  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      redirect: 'error',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    const code = isRedirectRefusal(error) ? 'redirect_refused' : 'network_error';
    return { ok: false, status: 0, code, body: null };
  }
  let text;
  try {
    text = await response.text();
  } catch {
    return { ok: false, status: 0, code: 'network_error', body: null };
  }
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  if (response.status >= 200 && response.status < 300) {
    return { ok: true, status: response.status, body: parsed };
  }
  const code = parsed && typeof parsed.code === 'string' ? parsed.code : 'unknown';
  return { ok: false, status: response.status, code, body: parsed };
}

function cookieHeader(response) {
  const list =
    typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  return list
    .map((entry) => entry.split(';', 1)[0]?.trim())
    .filter((entry) => entry && entry.includes('='))
    .join('; ');
}

async function login(persona, api) {
  let response;
  try {
    response = await fetch(new URL('/auth/mock-login', `${api}/`), {
      method: 'POST',
      redirect: 'error',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ external_id: persona }),
    });
  } catch (error) {
    recordFailed(
      `login:${persona}`,
      0,
      isRedirectRefusal(error) ? 'redirect_refused' : 'network_error',
    );
    return;
  }
  const cookie = cookieHeader(response);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok || !cookie) {
    recordFailed(`login:${persona}`, response.status, body?.code ?? 'auth_failed');
    return;
  }
  sessions[persona] = { cookie, actorId: body?.actor?.id ?? null };
  const me = await request('/me', { persona });
  if (!me.ok || me.body?.actor?.external_id !== persona) {
    delete sessions[persona];
    recordFailed(`login:${persona}`, me.status, me.code ?? 'me_mismatch');
  } else {
    sessions[persona].actorId = me.body.actor.id;
  }
}

async function loadSystems() {
  const listed = await request('/managed-systems', { persona: 'mock-admin-1' });
  if (!listed.ok) return listed;
  const bySlug = new Map(itemsOf(listed.body).map((row) => [row.slug, row]));
  return { ok: true, bySlug };
}

async function loadSeedVocs() {
  const listed = await request('/vocs', {
    persona: 'mock-admin-1',
    query: { view: 'inbox', limit: 50 },
  });
  if (!listed.ok) return listed;
  const rows = itemsOf(listed.body).filter((row) => row?.id && row?.primary_managed_system_id);
  const groups = new Map();
  for (const row of rows) {
    const group = groups.get(row.primary_managed_system_id) ?? [];
    group.push(row);
    groups.set(row.primary_managed_system_id, group);
  }
  const pair = [...groups.values()].find((group) => group.length >= 2);
  if (!pair) return { ok: false, status: 404, code: 'not_found.record' };
  return { ok: true, vocs: pair.slice(0, 2) };
}

async function stepFinding(vocs) {
  const step = 'finding';
  if (!vocs) return null;
  const listed = await request('/findings', { persona: 'mock-admin-1' });
  if (!listed.ok) {
    recordFailed(step, listed.status, listed.code);
    return null;
  }
  const existing = findMarked(itemsOf(listed.body), 'title', TITLE.finding);
  if (existing) {
    remember(step, existing, false);
    return existing;
  }
  const createdRow = await request(`/vocs/${vocs[0].id}/create-finding`, {
    method: 'POST',
    persona: 'mock-admin-1',
    idempotency: true,
    body: { title: TITLE.finding, summary: 'Preview fixture from a seed VOC.', severity: 'medium' },
  });
  if (!createdRow.ok) {
    recordFailed(step, createdRow.status, createdRow.code);
    return null;
  }
  remember(step, createdRow.body, true);
  return createdRow.body;
}

async function stepTaskRequest(finding) {
  const step = 'task_request';
  const listed = await request('/task-requests', { persona: 'mock-admin-1' });
  if (!listed.ok) {
    recordFailed(step, listed.status, listed.code);
    return null;
  }
  // Exact summary only. findMarked's prefix fallback would claim the pending request.
  const existing = itemsOf(listed.body).find((row) => row.evidence_summary === TITLE.taskRequest);
  if (existing) {
    remember(step, existing, false);
    return existing;
  }
  if (!finding?.id) {
    recordFailed(step, 0, 'prerequisite_missing');
    return null;
  }
  const createdRow = await request(`/findings/${finding.id}/request-task`, {
    method: 'POST',
    persona: 'mock-admin-1',
    idempotency: true,
    body: {
      evidence_summary: TITLE.taskRequest,
      requested_outcome: 'Open the Task Request drawer in a throwaway preview.',
    },
  });
  if (!createdRow.ok) {
    recordFailed(step, createdRow.status, createdRow.code);
    return null;
  }
  remember(step, createdRow.body, true);
  return createdRow.body;
}

async function stepTaskRequestPending(finding) {
  const step = 'task_request_pending';
  const listed = await request('/task-requests', {
    persona: 'mock-admin-1',
    query: { status: 'pending_review' },
  });
  if (!listed.ok) {
    recordFailed(step, listed.status, listed.code);
    return null;
  }
  const existing = itemsOf(listed.body).find(
    (row) => row.evidence_summary === TITLE.taskRequestPending,
  );
  if (existing) {
    remember(step, existing, false);
    return existing;
  }
  if (!finding?.id) {
    recordFailed(step, 0, 'prerequisite_missing');
    return null;
  }
  const createdRow = await request(`/findings/${finding.id}/request-task`, {
    method: 'POST',
    persona: 'mock-admin-1',
    idempotency: true,
    body: {
      evidence_summary: TITLE.taskRequestPending,
      requested_outcome: 'Leave this Task Request pending for the review drawer.',
    },
  });
  if (!createdRow.ok) {
    recordFailed(step, createdRow.status, createdRow.code);
    return null;
  }
  remember(step, createdRow.body, true);
  return createdRow.body;
}

async function stepTask(taskRequest) {
  const step = 'task';
  const listed = await request('/tasks', { persona: 'mock-admin-1' });
  if (!listed.ok) {
    recordFailed(step, listed.status, listed.code);
    return null;
  }
  const tasks = itemsOf(listed.body);
  const existing =
    tasks.find((row) => row.title === TITLE.task) ??
    (taskRequest?.id
      ? tasks.find((row) => row.source_task_request_id === taskRequest.id)
      : null);
  if (existing) {
    remember(step, existing, false);
    return existing;
  }
  if (!taskRequest?.id) {
    recordFailed(step, 0, 'prerequisite_missing');
    return null;
  }
  let status = taskRequest.status;
  if (status === 'pending_review' || status === 'needs_more_evidence') {
    const approved = await request(`/task-requests/${taskRequest.id}/approve`, {
      method: 'POST',
      persona: 'mock-admin-1',
      idempotency: true,
      body: { reason: `${MARK} approve for the preview task` },
    });
    if (!approved.ok) {
      recordFailed(step, approved.status, approved.code);
      return null;
    }
    status = approved.body?.status ?? 'approved';
  }
  if (status !== 'approved' && status !== 'converted') {
    recordFailed(step, 422, 'not_approved');
    return null;
  }
  if (status === 'converted') {
    recordFailed(step, 404, 'not_found.record');
    return null;
  }
  const converted = await request(`/task-requests/${taskRequest.id}/convert`, {
    method: 'POST',
    persona: 'mock-admin-1',
    idempotency: true,
    body: { title: TITLE.task },
  });
  if (!converted.ok) {
    recordFailed(step, converted.status, converted.code);
    return null;
  }
  remember(step, converted.body, true);
  return converted.body;
}

async function stepMilestone(task) {
  const step = 'milestone';
  if (!task?.id || !task.primary_managed_system_id) {
    recordFailed(step, 0, 'prerequisite_missing');
    return null;
  }
  const listed = await request('/milestones', { persona: 'mock-admin-1' });
  if (!listed.ok) {
    recordFailed(step, listed.status, listed.code);
    return null;
  }
  let milestone = itemsOf(listed.body).find(
    (row) =>
      row.title === TITLE.milestone &&
      row.primary_managed_system_id === task.primary_managed_system_id,
  );
  const wasCreated = !milestone;
  if (!milestone) {
    const createdRow = await request('/milestones', {
      method: 'POST',
      persona: 'mock-admin-1',
      idempotency: true,
      body: {
        title: TITLE.milestone,
        why: 'Preview fixture so the Milestone drawer has one record.',
        primary_managed_system_id: task.primary_managed_system_id,
        start_date: '2026-10-01',
        target_date: '2026-12-31',
      },
    });
    if (!createdRow.ok) {
      recordFailed(step, createdRow.status, createdRow.code);
      return null;
    }
    milestone = createdRow.body;
  }
  if (task.milestone_id !== milestone.id) {
    const assigned = await request(`/tasks/${task.id}/milestone`, {
      method: 'POST',
      persona: 'mock-admin-1',
      idempotency: true,
      ifMatch: task.updated_at,
      body: { milestone_id: milestone.id },
    });
    if (!assigned.ok) {
      recordFailed(step, assigned.status, assigned.code);
      return null;
    }
  }
  remember(step, milestone, wasCreated);
  return milestone;
}

async function stepCluster(vocs, systems) {
  const step = 'voc_cluster';
  if (!vocs) {
    recordFailed(step, 0, 'prerequisite_missing');
    return null;
  }
  const managedSystemId = vocs[0].primary_managed_system_id;
  const slug = [...(systems?.values() ?? [])].find((row) => row.id === managedSystemId)?.slug;
  const persona = slug === 'tableau' ? 'mock-developer-1' : 'mock-admin-1';
  if (!sessions[persona]) {
    recordFailed(step, 0, 'not_logged_in');
    return null;
  }
  const listed = await request('/voc-clusters', { persona: 'mock-admin-1' });
  if (!listed.ok) {
    recordFailed(step, listed.status, listed.code);
    return null;
  }
  let cluster = findMarked(itemsOf(listed.body), 'title', TITLE.cluster);
  const wasCreated = !cluster;
  if (!cluster) {
    const createdRow = await request('/voc-clusters', {
      method: 'POST',
      persona,
      body: {
        title: TITLE.cluster,
        summary: 'Two seed VOCs so the Cluster drawer has members.',
        primary_managed_system_id: managedSystemId,
      },
    });
    if (!createdRow.ok) {
      recordFailed(step, createdRow.status, createdRow.code);
      return null;
    }
    cluster = createdRow.body;
  }
  const detail = await request(`/voc-clusters/${cluster.id}`, { persona: 'mock-admin-1' });
  if (!detail.ok) {
    recordFailed(step, detail.status, detail.code);
    return null;
  }
  const memberIds = new Set((detail.body?.members ?? []).map((member) => member.voc_id));
  for (const voc of vocs) {
    if (memberIds.has(voc.id)) continue;
    const added = await request(`/voc-clusters/${cluster.id}/vocs`, {
      method: 'POST',
      persona,
      body: { voc_id: voc.id },
    });
    if (!added.ok) {
      recordFailed(step, added.status, added.code);
      return null;
    }
  }
  remember(step, cluster, wasCreated);
  return cluster;
}

async function ensureQuestions(survey, persona, wanted) {
  const detail = await request(`/surveys/${survey.id}`, { persona });
  if (!detail.ok) return detail;
  const questions = detail.body?.questions ?? [];
  const have = new Set(questions.map((question) => question.kind));
  const createdQuestions = [...questions];
  if (detail.body?.status !== 'draft') {
    return { ok: true, questions: createdQuestions, survey: detail.body };
  }
  for (const question of wanted) {
    if (have.has(question.kind)) continue;
    const saved = await request(`/surveys/${survey.id}/questions`, {
      method: 'POST',
      persona,
      idempotency: true,
      body: question,
    });
    if (!saved.ok) return saved;
    createdQuestions.push(saved.body);
    have.add(question.kind);
  }
  return { ok: true, questions: createdQuestions, survey: detail.body };
}

async function ensureOpen(survey, persona) {
  if (survey.status === 'open' || survey.status === 'closed') return { ok: true, body: survey };
  const opened = await request(`/surveys/${survey.id}/open`, {
    method: 'POST',
    persona,
    idempotency: true,
  });
  return opened.ok ? { ok: true, body: opened.body } : opened;
}

const RATING_QUESTION = {
  kind: 'rating',
  prompt: `${MARK} How does this preview look?`,
  is_required: true,
  rating_min: 1,
  rating_max: 5,
};
const TEXT_QUESTION = {
  kind: 'text',
  prompt: `${MARK} What should the preview show?`,
  is_required: true,
};

async function ensureSurvey(kind, { title, type, systemId, questions }) {
  const persona = 'mock-developer-2';
  if (!systemId) {
    recordFailed(kind, 404, 'not_found.record');
    return null;
  }
  if (!sessions[persona]) {
    recordFailed(kind, 0, 'not_logged_in');
    return null;
  }
  const listed = await request('/surveys', { persona });
  if (!listed.ok) {
    recordFailed(kind, listed.status, listed.code);
    return null;
  }
  let survey = itemsOf(listed.body).find((row) => row.title === title && row.type === type);
  const wasCreated = !survey;
  if (!survey) {
    const createdRow = await request('/surveys', {
      method: 'POST',
      persona,
      idempotency: true,
      body: {
        type,
        title,
        description: 'Preview fixture.',
        primary_managed_system_id: systemId,
        responses_identity_protected: false,
      },
    });
    if (!createdRow.ok) {
      recordFailed(kind, createdRow.status, createdRow.code);
      return null;
    }
    survey = createdRow.body;
  }
  const withQuestions = await ensureQuestions(survey, persona, questions);
  if (!withQuestions.ok) {
    recordFailed(kind, withQuestions.status, withQuestions.code);
    return null;
  }
  const opened = await ensureOpen(withQuestions.survey ?? survey, persona);
  if (!opened.ok) {
    recordFailed(kind, opened.status, opened.code);
    return null;
  }
  const ready = { ...(opened.body ?? survey), questions: withQuestions.questions };
  remember(kind, ready, wasCreated);
  return ready;
}

async function hasResponse(persona, surveyId) {
  const listed = await request('/me/survey-responses', { persona, query: { limit: 100 } });
  if (!listed.ok) return listed;
  const hit = itemsOf(listed.body).some((row) => row.survey_id === surveyId);
  return { ok: true, hit };
}

async function submitResponse(persona, survey, answers) {
  const already = await hasResponse(persona, survey.id);
  if (!already.ok) return already;
  if (already.hit) return { ok: true, reused: true, body: { id: null, survey_id: survey.id } };
  return request(`/surveys/${survey.id}/responses`, {
    method: 'POST',
    persona,
    idempotency: true,
    body: { answers },
  });
}

function answersFor(survey, value) {
  const questions = survey.questions ?? [];
  const answers = [];
  for (const question of questions) {
    if (question.kind === 'rating') answers.push({ question_id: question.id, value });
    else if (question.kind === 'text') {
      answers.push({ question_id: question.id, value: `${MARK} preview answer` });
    }
  }
  return answers;
}

async function stepDiscoveryResponse(survey) {
  const step = 'discovery_response';
  if (!survey?.id) {
    recordFailed(step, 0, 'prerequisite_missing');
    return;
  }
  const submitted = await submitResponse('mock-user-1', survey, answersFor(survey, 4));
  if (!submitted.ok) {
    recordFailed(step, submitted.status, submitted.code);
    return;
  }
  remember(step, submitted.body ?? { id: null }, !submitted.reused);
}

async function stepOutcomeResponse(survey) {
  const step = 'outcome_response';
  if (!survey?.id) {
    recordFailed(step, 0, 'prerequisite_missing');
    return;
  }
  const submitted = await submitResponse('mock-user-1', survey, answersFor(survey, 1));
  if (!submitted.ok) {
    recordFailed(step, submitted.status, submitted.code);
    return;
  }
  remember(step, submitted.body ?? { id: null }, !submitted.reused);
}

async function stepOutcomeFollowUp(survey) {
  const step = 'outcome_follow_up';
  if (!survey?.id || !survey.primary_managed_system_id) {
    recordFailed(step, 0, 'prerequisite_missing');
    return;
  }
  let produced = false;
  const fillers = [
    ['mock-user-2', 5],
    ['mock-admin-2', 5],
    ['mock-developer-1', 5],
    ['mock-developer-2', 5],
  ];
  if (survey.status !== 'closed') {
    produced = true;
    for (const [persona, value] of fillers) {
      const submitted = await submitResponse(persona, survey, answersFor(survey, value));
      if (!submitted.ok) {
        recordFailed(step, submitted.status, submitted.code);
        return;
      }
    }
    const respondents = ['mock-user-1', ...fillers.map(([persona]) => persona)];
    for (const persona of respondents) {
      const answered = await hasResponse(persona, survey.id);
      if (!answered.ok) {
        recordFailed(step, answered.status, answered.code);
        return;
      }
      if (!answered.hit) {
        recordFailed(step, 0, 'prerequisite_missing');
        return;
      }
    }
    const closed = await request(`/surveys/${survey.id}/close`, {
      method: 'POST',
      persona: 'mock-developer-2',
      idempotency: true,
    });
    if (!closed.ok) {
      recordFailed(step, closed.status, closed.code);
      return;
    }
  } else {
    // Reused closed survey: classifiable is the safe flag that the cohort meets the threshold.
    const preview = await request(`/surveys/${survey.id}/outcome-follow-up`, {
      persona: 'mock-admin-1',
    });
    if (!preview.ok) {
      recordFailed(step, preview.status, preview.code);
      return;
    }
    if (preview.body?.classifiable !== true) {
      recordFailed(step, 0, 'prerequisite_missing');
      return;
    }
  }
  const systemId = survey.primary_managed_system_id;
  const check = await request('/me/permissions/check', {
    persona: 'mock-admin-1',
    query: { capability: 'survey.read_personal_responses', managed_system_id: systemId },
  });
  if (!check.ok) {
    recordFailed(step, check.status, check.code);
    return;
  }
  if (check.body?.decision?.allow !== true) {
    if (!sessions['mock-admin-1'] || !sessions['mock-admin-2']) {
      recordFailed(step, 0, 'prerequisite_missing');
      return;
    }
    produced = true;
    const pending = await request('/permission-requests', {
      persona: 'mock-admin-1',
      query: { status: 'pending' },
    });
    if (!pending.ok) {
      recordFailed(step, pending.status, pending.code);
      return;
    }
    let requestId = itemsOf(pending.body).find(
      (row) =>
        row.requested_capability === 'survey.read_personal_responses' &&
        row.requested_managed_system_id === systemId &&
        row.requester_actor_id === sessions['mock-admin-1']?.actorId &&
        marked(row.reason),
    )?.id;
    if (!requestId) {
      const createdRequest = await request('/permission-requests', {
        method: 'POST',
        persona: 'mock-admin-1',
        idempotency: true,
        body: {
          requested_capability: 'survey.read_personal_responses',
          requested_managed_system_id: systemId,
          reason: TITLE.personalRead,
        },
      });
      if (!createdRequest.ok) {
        recordFailed(step, createdRequest.status, createdRequest.code);
        return;
      }
      requestId = createdRequest.body?.id;
    }
    const approved = await request(`/permissions/requests/${requestId}/approve`, {
      method: 'POST',
      persona: 'mock-admin-2',
      idempotency: true,
      body: { reason: TITLE.personalRead },
    });
    if (!approved.ok) {
      recordFailed(step, approved.status, approved.code);
      return;
    }
  }
  const followUp = await request(`/surveys/${survey.id}/outcome-follow-up`, {
    persona: 'mock-admin-1',
  });
  if (!followUp.ok) {
    recordFailed(step, followUp.status, followUp.code);
    return;
  }
  const item = followUp.body?.personal_access
    ? followUp.body.items?.find((row) => row.resolution === 'open')
    : null;
  if (!followUp.body?.classifiable || !item) {
    recordFailed(step, followUp.status, 'follow_up_item_missing');
    return;
  }
  remember(step, { id: item.response_id, display_id: null }, produced);
}

async function stepPermission(systemId) {
  const step = 'permission_request';
  const persona = 'mock-user-2';
  if (!sessions[persona]) {
    recordFailed(step, 0, 'not_logged_in');
    return;
  }
  if (!systemId) {
    recordFailed(step, 404, 'not_found.record');
    return;
  }
  const listed = await request('/permission-requests/mine', { persona });
  if (!listed.ok) {
    recordFailed(step, listed.status, listed.code);
    return;
  }
  const existing = itemsOf(listed.body).find(
    (row) => row.requested_capability === 'finding.manage' && marked(row.reason),
  );
  if (existing) {
    remember(step, existing, false);
    return;
  }
  const createdRow = await request('/permission-requests', {
    method: 'POST',
    persona,
    idempotency: true,
    body: {
      requested_capability: 'finding.manage',
      requested_managed_system_id: systemId,
      reason: TITLE.permission,
    },
  });
  if (!createdRow.ok) {
    recordFailed(step, createdRow.status, createdRow.code);
    return;
  }
  remember(step, createdRow.body, true);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) finish({ ok: false, error: args.error }, 2);
  if (args.dryRun) finish({ ok: true, dry_run: true, steps: DRY_RUN_STEPS });

  origin = args.api;
  for (const persona of PERSONAS) await login(persona, args.api);

  const systems = await loadSystems();
  const systemMap = systems.ok ? systems.bySlug : null;
  const powerBiId = systemMap?.get('power-bi')?.id ?? null;
  const vocsResult = await loadSeedVocs();
  const vocs = vocsResult.ok ? vocsResult.vocs : null;
  if (!vocsResult.ok) recordFailed('finding', vocsResult.status, vocsResult.code);

  const finding = vocs ? await guard('finding', () => stepFinding(vocs)) : null;
  const taskRequest = await guard('task_request', () => stepTaskRequest(finding));
  const task = await guard('task', () => stepTask(taskRequest));
  await guard('task_request_pending', () => stepTaskRequestPending(finding));
  await guard('milestone', () => stepMilestone(task));
  await guard('voc_cluster', () => stepCluster(vocs, systemMap));
  let discovery = null;
  let outcome = null;
  if (!systems.ok) {
    recordFailed('discovery_survey', systems.status, systems.code);
    recordFailed('outcome_survey', systems.status, systems.code);
  } else if (!powerBiId) {
    recordFailed('discovery_survey', 404, 'not_found.record');
    recordFailed('outcome_survey', 404, 'not_found.record');
  } else {
    discovery = await guard('discovery_survey', () =>
      ensureSurvey('discovery_survey', {
        title: TITLE.discovery,
        type: 'discovery',
        systemId: powerBiId,
        questions: [RATING_QUESTION, TEXT_QUESTION],
      }),
    );
    outcome = await guard('outcome_survey', () =>
      ensureSurvey('outcome_survey', {
        title: TITLE.outcome,
        type: 'outcome',
        systemId: powerBiId,
        questions: [RATING_QUESTION],
      }),
    );
  }
  await guard('discovery_response', () => stepDiscoveryResponse(discovery));
  await guard('outcome_response', () => stepOutcomeResponse(outcome));
  await guard('outcome_follow_up', () => stepOutcomeFollowUp(outcome));
  await guard('permission_request', () =>
    stepPermission(vocs?.[0]?.primary_managed_system_id ?? powerBiId),
  );

  finish({ ok: failed.length === 0, created, reused, failed });
}

await main();
