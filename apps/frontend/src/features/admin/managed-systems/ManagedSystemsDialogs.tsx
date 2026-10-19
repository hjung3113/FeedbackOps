import {
  Button,
  Callout,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DirtyConfirmation,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fops/ui';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { GLOSSARY } from '@/lib/copy/glossary';
import { MANAGED_SYSTEM_COPY } from '@/lib/copy/managed-systems';
import type {
  ManagedSystemDto,
  RegisterManagedSystemBody,
  UpdateManagedSystemBody,
} from '../../../lib/api';
import {
  ApiError,
  archiveManagedSystem,
  registerManagedSystem,
  updateManagedSystem,
} from '../../../lib/api';
import { ArchiveConfirmButton } from '../lib/ArchiveConfirmButton';
import { envelopeMessage } from '../lib/envelopeMessage.js';

import { useKnownOwnerTeam, useRegistryActorOptions } from './useManagedSystemsRegistry.js';

type OwnerSelection =
  | { kind: 'none' }
  | { kind: 'actor'; id: string }
  | { kind: 'team'; id: string };

function ownerSelection(
  row?: ManagedSystemDto,
  kind: 'owner' | 'reviewer' = 'owner',
): OwnerSelection {
  if (kind === 'reviewer') {
    if (row?.default_reviewer_actor_id) return { kind: 'actor', id: row.default_reviewer_actor_id };
    if (row?.default_reviewer_team_id) return { kind: 'team', id: row.default_reviewer_team_id };
    return { kind: 'none' };
  }
  if (row?.default_owner_actor_id) return { kind: 'actor', id: row.default_owner_actor_id };
  if (row?.default_owner_team_id) return { kind: 'team', id: row.default_owner_team_id };
  return { kind: 'none' };
}

function ownerSelectionValue(owner: OwnerSelection): string {
  return owner.kind === 'none' ? 'none' : `${owner.kind}:${owner.id}`;
}

function parseOwnerSelection(value: string): OwnerSelection {
  if (value === 'none') return { kind: 'none' };
  const separator = value.indexOf(':');
  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1);
  return kind === 'team' ? { kind: 'team', id } : { kind: 'actor', id };
}

type DefaultErrors = Partial<Record<'owner' | 'reviewer', string>>;

function defaultFieldErrors(error: unknown): DefaultErrors {
  if (!(error instanceof ApiError) || !Array.isArray(error.detail?.fields)) return {};
  const result: DefaultErrors = {};
  for (const field of error.detail.fields as { path?: unknown; code?: unknown }[]) {
    if (!Array.isArray(field.path) || typeof field.code !== 'string') continue;
    if (!(field.code in MANAGED_SYSTEM_COPY.categories)) continue;
    const message =
      MANAGED_SYSTEM_COPY.categories[field.code as keyof typeof MANAGED_SYSTEM_COPY.categories];
    for (const kind of ['owner', 'reviewer'] as const) {
      if (
        field.path[0] === `default_${kind}_actor_id` ||
        field.path[0] === `default_${kind}_team_id`
      )
        result[kind] = message;
    }
  }
  return result;
}

function OwnerSelect({
  value,
  onChange,
  knownTeamId,
  testId,
  reviewer = false,
  managedSystemId,
  error,
}: {
  value: OwnerSelection;
  onChange: (value: OwnerSelection) => void;
  // `exactOptionalPropertyTypes` is on — callers pass `?? undefined` for systems
  // with no team owner, so the property must accept an explicit undefined.
  knownTeamId?: string | undefined;
  testId: string;
  reviewer?: boolean;
  managedSystemId?: string;
  error?: string;
}) {
  const actorOptions = useRegistryActorOptions(managedSystemId, reviewer);
  const knownTeam = useKnownOwnerTeam(knownTeamId);

  return (
    <div className="space-y-1">
      <FieldLabel htmlFor={testId} tone="secondary">
        {reviewer ? MANAGED_SYSTEM_COPY.reviewerOptional : MANAGED_SYSTEM_COPY.ownerOptional}
      </FieldLabel>
      <Select
        value={ownerSelectionValue(value)}
        onValueChange={(next) => onChange(parseOwnerSelection(next))}
      >
        <SelectTrigger
          id={testId}
          data-testid={testId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${testId}-error` : reviewer ? `${testId}-hint` : undefined}
        >
          <SelectValue placeholder="(미지정)" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="none">(미지정)</SelectItem>
            {knownTeam ? (
              <SelectItem value={`team:${knownTeam.id}`}>{knownTeam.name}</SelectItem>
            ) : null}
            {(actorOptions.data ?? []).map((actor) => (
              <SelectItem key={actor.id} value={`actor:${actor.id}`} disabled={!actor.eligible}>
                {actor.display_name}
                {!actor.eligible ? ` · ${MANAGED_SYSTEM_COPY.categories.ineligible_actor}` : ''}
              </SelectItem>
            ))}
            {actorOptions.isSuccess &&
            value.kind === 'actor' &&
            !actorOptions.data?.some((actor) => actor.id === value.id) ? (
              <SelectItem value={`actor:${value.id}`} disabled>
                {MANAGED_SYSTEM_COPY.currentActor} ·{' '}
                {MANAGED_SYSTEM_COPY.categories.ineligible_actor}
              </SelectItem>
            ) : null}
          </SelectGroup>
        </SelectContent>
      </Select>
      {reviewer ? (
        <p id={`${testId}-hint`} className="text-xs text-text-muted">
          {MANAGED_SYSTEM_COPY.reviewerHint}
        </p>
      ) : null}
      {error ? (
        <p id={`${testId}-error`} className="text-xs text-accent-danger">
          {error}
        </p>
      ) : null}
      {actorOptions.isError ? (
        <Callout
          tone="red"
          title={MANAGED_SYSTEM_COPY.candidatesError}
          action={
            <Button
              type="button"
              variant="subtle"
              size="sm"
              onClick={() => void actorOptions.refetch()}
            >
              {MANAGED_SYSTEM_COPY.retry}
            </Button>
          }
        >
          {MANAGED_SYSTEM_COPY.candidatesErrorHint}
        </Callout>
      ) : null}
    </div>
  );
}

function RegisterDialog({
  open,
  prefill,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  /** Archived row being re-registered under the same slug, if any. */
  prefill?: ManagedSystemDto | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [slug, setSlug] = useState(prefill?.slug ?? '');
  const [name, setName] = useState(prefill?.name ?? '');
  const [externalKey, setExternalKey] = useState(prefill?.external_key ?? '');
  const [owner, setOwner] = useState<OwnerSelection>({ kind: 'none' });
  const [reviewer, setReviewer] = useState<OwnerSelection>({ kind: 'none' });
  const [error, setError] = useState<string | null>(null);
  const [defaultErrors, setDefaultErrors] = useState<DefaultErrors>({});
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'slug' | 'name', string>>>({});
  const slugRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: async (body: RegisterManagedSystemBody) => registerManagedSystem(body),
    onSuccess: async () => {
      setSlug('');
      setName('');
      setExternalKey('');
      setOwner({ kind: 'none' });
      setReviewer({ kind: 'none' });
      setError(null);
      await onSaved();
    },
    onError: (err) => {
      setDefaultErrors(defaultFieldErrors(err));
      setError(envelopeMessage(err));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="ms-register-dialog">
        <DialogHeader>
          <DialogTitle>{prefill ? '보관된 시스템 재등록' : 'Managed System 등록'}</DialogTitle>
          <DialogDescription>
            {prefill
              ? `보관된 "${prefill.slug}"를 같은 슬러그로 다시 등록합니다. 보관 해제가 아니라 새 레코드가 만들어지며, 기존 VOC·Finding·Task 등 과거 참조는 보관된 시스템에 그대로 남습니다.`
              : '새 Managed System을 레지스트리에 추가합니다.'}
          </DialogDescription>
        </DialogHeader>
        <form
          data-testid="create-managed-system-form"
          className="space-y-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            setDefaultErrors({});
            const nextErrors: Partial<Record<'slug' | 'name', string>> = {};
            if (!slug.trim()) nextErrors.slug = '슬러그를 입력해 주세요.';
            if (!name.trim()) nextErrors.name = '이름을 입력해 주세요.';
            if (Object.keys(nextErrors).length > 0) {
              setFieldErrors(nextErrors);
              (nextErrors.slug ? slugRef : nameRef).current?.focus();
              return;
            }
            setFieldErrors({});
            const body: RegisterManagedSystemBody = { slug, name };
            if (externalKey.length > 0) body.external_key = externalKey;
            if (owner.kind === 'actor') body.default_owner_actor_id = owner.id;
            if (owner.kind === 'team') body.default_owner_team_id = owner.id;
            if (reviewer.kind === 'actor') body.default_reviewer_actor_id = reviewer.id;
            if (reviewer.kind === 'team') body.default_reviewer_team_id = reviewer.id;
            mutation.mutate(body);
          }}
        >
          <div className="space-y-1">
            <FieldLabel htmlFor="ms-create-slug" tone="secondary">
              슬러그 <span className="text-accent-danger">· 필수</span>
            </FieldLabel>
            <Input
              id="ms-create-slug"
              ref={slugRef}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              aria-describedby={fieldErrors.slug ? 'ms-create-slug-error' : undefined}
              aria-invalid={Boolean(fieldErrors.slug)}
              aria-required="true"
              data-testid="create-slug"
            />
            {fieldErrors.slug && (
              <p id="ms-create-slug-error" className="text-sm text-accent-danger">
                {fieldErrors.slug}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <FieldLabel htmlFor="ms-create-name" tone="secondary">
              이름 <span className="text-accent-danger">· 필수</span>
            </FieldLabel>
            <Input
              id="ms-create-name"
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-describedby={fieldErrors.name ? 'ms-create-name-error' : undefined}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-required="true"
              data-testid="create-name"
            />
            {fieldErrors.name && (
              <p id="ms-create-name-error" className="text-sm text-accent-danger">
                {fieldErrors.name}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <FieldLabel htmlFor="ms-create-external-key" tone="secondary">
              외부 키 (선택)
            </FieldLabel>
            <Input
              id="ms-create-external-key"
              value={externalKey}
              onChange={(e) => setExternalKey(e.target.value)}
              data-testid="create-external-key"
            />
          </div>
          <OwnerSelect
            value={owner}
            onChange={setOwner}
            testId="create-default-owner"
            {...(defaultErrors.owner ? { error: defaultErrors.owner } : {})}
          />
          <OwnerSelect
            value={reviewer}
            onChange={setReviewer}
            {...(defaultErrors.reviewer ? { error: defaultErrors.reviewer } : {})}
            testId="create-default-reviewer"
            reviewer
          />
          {error && (
            <p data-testid="create-error" className="text-sm text-accent-danger">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              data-testid="create-cancel"
            >
              취소
            </Button>
            <Button type="submit" disabled={mutation.isPending} data-testid="create-submit">
              등록
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  target,
  onOpenChange,
  onCloseAutoFocus,
  onReregister,
  onSaved,
}: {
  target: ManagedSystemDto | null;
  onOpenChange: (v: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  onReregister: (target: ManagedSystemDto) => void;
  onSaved: () => Promise<void>;
}) {
  const [dirty, setDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <>
      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          // Escape, the × button and an outside click all arrive here.
          if (!open && dirty) setConfirmOpen(true);
          else onOpenChange(open);
        }}
      >
        <DialogContent
          data-testid="ms-edit-dialog"
          {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
        >
          {target && (
            <EditForm
              key={target.id}
              target={target}
              onDirtyChange={setDirty}
              onReregister={onReregister}
              onSaved={onSaved}
            />
          )}
        </DialogContent>
      </Dialog>
      <DirtyConfirmation
        open={confirmOpen}
        onConfirm={() => {
          setConfirmOpen(false);
          onOpenChange(false);
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

function EditForm({
  target,
  onDirtyChange,
  onReregister,
  onSaved,
}: {
  target: ManagedSystemDto;
  onDirtyChange: (dirty: boolean) => void;
  onReregister: (target: ManagedSystemDto) => void;
  onSaved: () => Promise<void>;
}) {
  const isArchived = target.archived_at !== null;
  const [name, setName] = useState(target.name);
  const [externalKey, setExternalKey] = useState(target.external_key ?? '');
  const [owner, setOwner] = useState<OwnerSelection>(() => ownerSelection(target));
  const [reviewer, setReviewer] = useState<OwnerSelection>(() =>
    ownerSelection(target, 'reviewer'),
  );
  const [error, setError] = useState<string | null>(null);
  const [defaultErrors, setDefaultErrors] = useState<DefaultErrors>({});

  const dirty =
    !isArchived &&
    (name !== target.name ||
      externalKey !== (target.external_key ?? '') ||
      ownerSelectionValue(owner) !== ownerSelectionValue(ownerSelection(target)) ||
      ownerSelectionValue(reviewer) !== ownerSelectionValue(ownerSelection(target, 'reviewer')));
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const body: UpdateManagedSystemBody = {};
      if (name !== target.name) body.name = name;
      const nextKey = externalKey.length > 0 ? externalKey : null;
      if (nextKey !== target.external_key) body.external_key = nextKey;
      if (ownerSelectionValue(owner) !== ownerSelectionValue(ownerSelection(target))) {
        body.default_owner_actor_id = owner.kind === 'actor' ? owner.id : null;
        body.default_owner_team_id = owner.kind === 'team' ? owner.id : null;
      }
      if (
        ownerSelectionValue(reviewer) !== ownerSelectionValue(ownerSelection(target, 'reviewer'))
      ) {
        body.default_reviewer_actor_id = reviewer.kind === 'actor' ? reviewer.id : null;
        body.default_reviewer_team_id = reviewer.kind === 'team' ? reviewer.id : null;
      }
      return updateManagedSystem(target.id, body);
    },
    onSuccess: async () => {
      setError(null);
      await onSaved();
    },
    onError: (err) => {
      setDefaultErrors(defaultFieldErrors(err));
      setError(envelopeMessage(err));
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async () => archiveManagedSystem(target.id),
    onSuccess: async () => {
      setError(null);
      await onSaved();
    },
    onError: (err) => {
      setDefaultErrors(defaultFieldErrors(err));
      setError(envelopeMessage(err));
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{target.name} 설정</DialogTitle>
        <DialogDescription>
          <span className="font-mono text-xs">managed-system/{target.slug}</span>
        </DialogDescription>
      </DialogHeader>
      <form
        data-testid={`edit-managed-system-form-${target.slug}`}
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setDefaultErrors({});
          updateMutation.mutate();
        }}
      >
        <div className="space-y-1">
          <FieldLabel htmlFor={`ms-edit-name-${target.slug}`} tone="secondary">
            이름
          </FieldLabel>
          <Input
            id={`ms-edit-name-${target.slug}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            readOnly={isArchived}
            data-testid={`name-input-${target.slug}`}
          />
        </div>
        <OwnerSelect
          value={owner}
          onChange={setOwner}
          knownTeamId={target.default_owner_team_id ?? undefined}
          managedSystemId={target.id}
          {...(defaultErrors.owner ? { error: defaultErrors.owner } : {})}
          testId={`edit-default-owner-${target.slug}`}
        />
        <OwnerSelect
          value={reviewer}
          onChange={setReviewer}
          knownTeamId={target.default_reviewer_team_id ?? undefined}
          managedSystemId={target.id}
          {...(defaultErrors.reviewer ? { error: defaultErrors.reviewer } : {})}
          testId={`edit-default-reviewer-${target.slug}`}
          reviewer
        />
        <div className="space-y-1">
          <FieldLabel htmlFor={`ms-edit-key-${target.slug}`} tone="secondary">
            외부 키
          </FieldLabel>
          <Input
            id={`ms-edit-key-${target.slug}`}
            value={externalKey}
            onChange={(e) => setExternalKey(e.target.value)}
            readOnly={isArchived}
            data-testid={`external-key-input-${target.slug}`}
          />
        </div>
        {error && (
          <p data-testid={`row-error-${target.slug}`} className="text-sm text-accent-danger">
            {error}
          </p>
        )}
        {isArchived && (
          <p
            className="text-sm text-text-muted"
            data-testid={`archived-immutable-note-${target.slug}`}
          >
            보관된 시스템은 수정할 수 없고 보관 해제도 지원하지 않습니다. 실수로 보관했다면 같은
            슬러그로 다시 등록하세요 — 새 레코드가 만들어지고, 과거 참조는 이 보관된 시스템에 그대로
            남습니다.
          </p>
        )}
        <DialogFooter className="justify-between">
          {isArchived ? (
            <span className="text-sm text-text-muted">이미 보관됨</span>
          ) : (
            <ArchiveConfirmButton
              name={target.name}
              disabled={archiveMutation.isPending}
              onConfirm={() => archiveMutation.mutate()}
              testId={`archive-${target.slug}`}
            />
          )}
          {isArchived ? (
            // No Save: PATCH against an archived row is 409 conflict.record_archived
            // by contract (ADR-0019 §A), so offering it can only fail.
            <Button
              type="button"
              onClick={() => onReregister(target)}
              data-testid={`reregister-${target.slug}`}
            >
              같은 슬러그로 재등록
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              data-testid={`save-${target.slug}`}
            >
              {GLOSSARY.save}
            </Button>
          )}
        </DialogFooter>
      </form>
    </>
  );
}

export { EditDialog, RegisterDialog };
