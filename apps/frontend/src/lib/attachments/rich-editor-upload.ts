import type { RichEditorAttachmentResult } from '@fops/ui';

import { uploadAttachment } from '@/lib/api/attachments';

export async function uploadRichEditorAttachment(file: File): Promise<RichEditorAttachmentResult> {
  const result = await uploadAttachment(file);
  return {
    attachment_id: result.id,
    name: result.name,
    size_bytes: result.size_bytes,
    mime_type: result.mime_type,
  };
}
