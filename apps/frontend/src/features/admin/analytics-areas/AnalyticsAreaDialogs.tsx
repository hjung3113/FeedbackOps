import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  ManagedSystemPicker,
  type PickerOption,
} from '@fops/ui';
import { useRef, useState } from 'react';

import type { AnalyticsAreaDto, UpdateAnalyticsAreaBody } from '../../../lib/api';
import {
  useArchiveAnalyticsAreaMutation,
  useRegisterAnalyticsAreaMutation,
  useUpdateAnalyticsAreaMutation,
} from './useAnalyticsAreaMutations.js';

export function RegisterDialog({
  ctx,
  msOptions,
  onOpenChange,
  onSaved,
}: {
  ctx: { open: boolean; msId: string | null };
  msOptions: PickerOption[];
  onOpenChange: (v: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  return (
    <Dialog open={ctx.open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="aa-register-dialog">
        {ctx.open && (
          <RegisterForm
            key={ctx.msId ?? 'none'}
            msOptions={msOptions}
            initialMsId={ctx.msId}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RegisterForm({
  msOptions,
  initialMsId,
  onSaved,
}: {
  msOptions: PickerOption[];
  initialMsId: string | null;
  onSaved: () => Promise<void>;
}) {
  const [msId, setMsId] = useState<string | null>(initialMsId);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<'managedSystem' | 'slug' | 'name', string>>
  >({});
  const managedSystemRef = useRef<HTMLFieldSetElement>(null);
  const slugRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const mutation = useRegisterAnalyticsAreaMutation({
    onSaved: async () => {
      setError(null);
      await onSaved();
    },
    onErrorMessage: setError,
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>New area</DialogTitle>
        <DialogDescription>
          Managed System 하위에 새 Analytics Area 를 등록합니다.
        </DialogDescription>
      </DialogHeader>
      <form
        data-testid="create-analytics-area-form"
        className="space-y-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const nextErrors: Partial<Record<'managedSystem' | 'slug' | 'name', string>> = {};
          if (!msId) nextErrors.managedSystem = 'Managed System is required.';
          if (!slug.trim()) nextErrors.slug = 'Slug is required.';
          if (!name.trim()) nextErrors.name = 'Name is required.';
          if (Object.keys(nextErrors).length > 0) {
            setFieldErrors(nextErrors);
            if (nextErrors.managedSystem) {
              managedSystemRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
            } else if (nextErrors.slug) slugRef.current?.focus();
            else nameRef.current?.focus();
            return;
          }
          setFieldErrors({});
          // Unreachable: the block above returns whenever msId is unset. Kept
          // so the narrowing is local instead of relying on nextErrors.
          if (!msId) return;
          mutation.mutate({ managed_system_id: msId, slug, name });
        }}
      >
        {/* fieldset, not a div with role="group" — biome's useSemanticElements
            rejects the ARIA-only form and the native element carries the same
            grouping for assistive tech. */}
        <fieldset
          className="space-y-1"
          ref={managedSystemRef}
          aria-labelledby="aa-create-managed-system-label"
          aria-describedby={
            fieldErrors.managedSystem ? 'aa-create-managed-system-error' : undefined
          }
          aria-required="true"
        >
          <Label id="aa-create-managed-system-label" className="text-text-secondary">
            Managed System <span className="text-accent-danger">· 필수</span>
          </Label>
          <ManagedSystemPicker
            options={msOptions}
            value={msId}
            onChange={setMsId}
            testId="create-ms-picker"
          />
          {fieldErrors.managedSystem && (
            <p id="aa-create-managed-system-error" className="text-sm text-accent-danger">
              {fieldErrors.managedSystem}
            </p>
          )}
        </fieldset>
        <div className="space-y-1">
          <Label htmlFor="aa-create-slug" className="text-text-secondary">
            Slug <span className="text-accent-danger">· 필수</span>
          </Label>
          <Input
            id="aa-create-slug"
            ref={slugRef}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            aria-describedby={fieldErrors.slug ? 'aa-create-slug-error' : undefined}
            aria-invalid={Boolean(fieldErrors.slug)}
            aria-required="true"
            data-testid="create-aa-slug"
          />
          {fieldErrors.slug && (
            <p id="aa-create-slug-error" className="text-sm text-accent-danger">
              {fieldErrors.slug}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="aa-create-name" className="text-text-secondary">
            Name <span className="text-accent-danger">· 필수</span>
          </Label>
          <Input
            id="aa-create-name"
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-describedby={fieldErrors.name ? 'aa-create-name-error' : undefined}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-required="true"
            data-testid="create-aa-name"
          />
          {fieldErrors.name && (
            <p id="aa-create-name-error" className="text-sm text-accent-danger">
              {fieldErrors.name}
            </p>
          )}
        </div>
        {error && (
          <p data-testid="create-aa-error" className="text-sm text-accent-danger">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="submit" disabled={mutation.isPending} data-testid="create-aa-submit">
            Register
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function EditDialog({
  target,
  onOpenChange,
  onSaved,
}: {
  target: AnalyticsAreaDto | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent data-testid="aa-edit-dialog">
        {target && <EditForm key={target.id} target={target} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  target,
  onSaved,
}: {
  target: AnalyticsAreaDto;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(target.name);
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useUpdateAnalyticsAreaMutation({
    targetId: target.id,
    onSaved: async () => {
      setError(null);
      await onSaved();
    },
    onErrorMessage: setError,
  });

  const archiveMutation = useArchiveAnalyticsAreaMutation({
    targetId: target.id,
    onSaved: async () => {
      setError(null);
      await onSaved();
    },
    onErrorMessage: setError,
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit {target.name}</DialogTitle>
        <DialogDescription>
          <span className="font-mono text-xs">analytics-area/{target.slug}</span>
        </DialogDescription>
      </DialogHeader>
      <form
        data-testid={`edit-analytics-area-form-${target.slug}`}
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const body: UpdateAnalyticsAreaBody = {};
          if (name !== target.name) body.name = name;
          updateMutation.mutate(body);
        }}
      >
        <div className="space-y-1">
          <Label htmlFor={`aa-edit-name-${target.slug}`} className="text-text-secondary">
            Name
          </Label>
          <Input
            id={`aa-edit-name-${target.slug}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid={`aa-name-input-${target.slug}`}
          />
        </div>
        {error && (
          <p data-testid={`aa-row-error-${target.slug}`} className="text-sm text-accent-danger">
            {error}
          </p>
        )}
        <DialogFooter className="justify-between">
          {target.archived_at === null ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => archiveMutation.mutate()}
              disabled={archiveMutation.isPending}
              data-testid={`aa-archive-${target.slug}`}
            >
              Archive
            </Button>
          ) : (
            <span className="text-sm text-text-muted">이미 보관됨</span>
          )}
          <Button
            type="submit"
            disabled={updateMutation.isPending}
            data-testid={`aa-save-${target.slug}`}
          >
            Save
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
