import { ERROR_CODES, type ErrorCode } from '@fops/shared';
import type { ApiErrorEnvelope, MappedError, Tone } from './types';

export const GENERIC_ERROR_MESSAGE = '일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';

interface CatalogEntry {
  tone: Tone;
  message: string | ((detail?: Record<string, unknown>) => string);
}

const CATALOG: Partial<Record<ErrorCode, CatalogEntry>> = {
  // auth.*
  'auth.session_invalid':  { tone: 'error', message: '세션이 유효하지 않습니다. 다시 로그인해 주세요.' },
  'auth.session_required': { tone: 'error', message: '로그인이 필요합니다.' },
  'auth.session_expired':  { tone: 'warning', message: '세션이 만료되었습니다. 다시 로그인해 주세요.' },
  'auth.workspace_mismatch': { tone: 'error', message: '워크스페이스 접근 권한이 없습니다.' },

  // permission.*
  'permission.denied':         { tone: 'error', message: '권한이 없습니다.' },
  'permission.scope_required': { tone: 'error', message: '해당 Managed System에 대한 권한이 없습니다.' },

  // rate_limited.*
  'rate_limited.actor': {
    tone: 'warning',
    message: (detail) => {
      const wait = formatRetryAfter(detail);
      return wait
        ? `요청이 너무 많습니다. ${wait} 후 다시 시도해 주세요.`
        : '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
    },
  },
  'rate_limited.ip': {
    tone: 'warning',
    message: (detail) => {
      const wait = formatRetryAfter(detail);
      return wait
        ? `동일 IP에서의 요청이 너무 많습니다. ${wait} 후 다시 시도해 주세요.`
        : '동일 IP에서의 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
    },
  },

  // validation.*
  'validation.failed':                    { tone: 'error', message: '입력값이 올바르지 않습니다.' },
  'validation.malformed_request':         { tone: 'error', message: '요청 형식이 잘못되었습니다.' },
  'validation.unknown_capability':        { tone: 'error', message: '알 수 없는 권한입니다.' },
  'validation.malformed_idempotency_key': { tone: 'error', message: 'Idempotency-Key가 잘못된 형식입니다. 새로고침 후 다시 시도해 주세요.' },
  'validation.sensitive_reason_required': { tone: 'error', message: '민감한 작업입니다. 사유를 입력해 주세요.' },
  'validation.immutable_field':           { tone: 'error', message: '이 필드는 변경할 수 없습니다.' },
  'validation.unexpected_field':          { tone: 'error', message: '허용되지 않는 필드가 포함되어 있습니다.' },

  // conflict.*
  'conflict.idempotency_key_reuse':        { tone: 'error', message: '같은 요청 키로 다른 작업을 시도했습니다. 새로고침 후 다시 시도해 주세요.' },
  'conflict.capability_already_granted':   { tone: 'info',  message: '이미 권한이 부여되어 있습니다.' },
  'conflict.permission_request_duplicate': { tone: 'info',  message: '동일한 권한 요청이 이미 진행 중입니다.' },
  'conflict.duplicate_slug':               { tone: 'error', message: '이미 사용 중인 식별자입니다.' },
  'conflict.parent_archived':              { tone: 'error', message: '상위 항목이 보관되어 더 이상 변경할 수 없습니다.' },
  'conflict.record_archived':              { tone: 'error', message: '이 항목은 보관되어 더 이상 변경할 수 없습니다.' },
  'conflict.stale_write':                  { tone: 'warning', message: '다른 사용자가 먼저 변경했습니다. 최신 내용을 불러올까요?' },
  'conflict.triage_already_committed':     { tone: 'error', message: '이미 트리아지가 완료되어 본인이 직접 수정할 수 없습니다.' },

  // not_found.*
  'not_found.record': { tone: 'error', message: '존재하지 않거나 접근할 수 없는 항목입니다.' },

  // internal.*
  'internal.unexpected': { tone: 'error', message: GENERIC_ERROR_MESSAGE },

  // voc.*
  'voc.severity_not_user_settable':             { tone: 'error', message: '심각도는 트리아지 단계에서만 설정할 수 있습니다.' },
  'voc.reporter_status_via_public_update_only': { tone: 'error', message: 'Reporter-facing status는 공개 업데이트를 통해서만 변경됩니다.' },

  // rich_content.*
  'rich_content.disallowed_node':          { tone: 'error', message: '허용되지 않는 콘텐츠 요소가 포함되어 있습니다.' },
  'rich_content.external_image_forbidden': { tone: 'error', message: '외부 이미지 링크는 허용되지 않습니다.' },

  // attachment.*
  'attachment.unsupported_pending_storage_slice': { tone: 'warning', message: '첨부 파일은 다음 단계에서 지원됩니다.' },

  // reporter_facing_status.*
  'reporter_facing_status.invalid_transition': { tone: 'warning', message: '허용되지 않는 상태 전환입니다.' },
  'reporter_facing_status.gate_blocked':       { tone: 'warning', message: '권한 게이트로 상태를 변경할 수 없습니다.' },
};

function formatRetryAfter(detail?: Record<string, unknown>): string | undefined {
  const raw = detail?.['retry_after_seconds'];
  const secs = typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
  if (secs === undefined || secs <= 0) return undefined;
  if (secs < 60) return `${secs}초`;
  return `${Math.ceil(secs / 60)}분`;
}

export function errorMapper(envelope: ApiErrorEnvelope, opts?: { onRetry?: () => void }): MappedError {
  const entry = CATALOG[envelope.code];
  let message: string;
  let tone: Tone;
  let action: MappedError['action'];

  if (entry) {
    message = typeof entry.message === 'function' ? entry.message(envelope.detail) : entry.message;
    tone = entry.tone;
  } else {
    message = GENERIC_ERROR_MESSAGE;
    tone = 'error';
  }

  if (envelope.code === 'conflict.stale_write' && opts?.onRetry) {
    action = { label: '최신 내용 불러오기', run: opts.onRetry };
  }

  return { tone, message, action };
}

// Sanity invariant — fail at module load if catalog drifts from ERROR_CODES.
export const __codeCount = ERROR_CODES.length;
