import { HttpError } from '../errors.js';
import { type RichContentError, sanitizeTipTap } from './sanitize.js';

function richContentFieldCode(error: RichContentError): string {
  if (error.code === 'rich_content.external_image_forbidden') return 'external_image_forbidden';
  return error.fields_code ?? 'disallowed_node';
}

export function sanitizeRichContentOrThrow(args: {
  surface: Parameters<typeof sanitizeTipTap>[0]['surface'];
  doc: unknown;
  fieldPath: ReadonlyArray<string | number>;
}) {
  const result = sanitizeTipTap({
    surface: args.surface,
    doc: args.doc as Parameters<typeof sanitizeTipTap>[0]['doc'],
  });
  if (!result.ok) {
    throw new HttpError(result.error.code, result.error.reason, {
      fields: [{ path: args.fieldPath, code: richContentFieldCode(result.error) }],
      hint: result.error.path,
    });
  }
  return result.doc;
}
