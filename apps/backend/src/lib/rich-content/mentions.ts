interface RichContentNode {
  type?: unknown;
  attrs?: unknown;
  content?: unknown;
}

export interface MentionValidationErrors {
  invalidActorId: () => Error;
  bodyRequestMismatch: () => Error;
}

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function findRichContentNodes(doc: unknown, type: string): RichContentNode[] {
  const results: RichContentNode[] = [];
  const stack: unknown[] = [doc];
  while (stack.length > 0) {
    const value = stack.pop();
    if (value === null || typeof value !== 'object') continue;

    const node = value as RichContentNode;
    if (node.type === type) results.push(node);
    if (Array.isArray(node.content)) {
      for (const child of node.content) stack.push(child);
    }
  }
  return results;
}

export function validateRichContentMentions(
  body: unknown,
  mentions: readonly string[] | undefined,
  errors: MentionValidationErrors,
): string[] {
  const bodyMentionIds: string[] = [];
  for (const node of findRichContentNodes(body, 'mention')) {
    const attrs = node.attrs;
    const actorId =
      attrs !== null && typeof attrs === 'object' && !Array.isArray(attrs)
        ? (attrs as Record<string, unknown>).actor_id
        : undefined;
    if (typeof actorId !== 'string' || !UUID_REGEX.test(actorId)) {
      throw errors.invalidActorId();
    }
    bodyMentionIds.push(actorId);
  }

  const requestMentionIds = [...new Set(mentions ?? [])];
  const bodyIds = new Set(bodyMentionIds);
  const requestIds = new Set(requestMentionIds);
  if (
    bodyIds.size !== requestIds.size ||
    [...bodyIds].some((actorId) => !requestIds.has(actorId))
  ) {
    throw errors.bodyRequestMismatch();
  }

  return requestMentionIds;
}
