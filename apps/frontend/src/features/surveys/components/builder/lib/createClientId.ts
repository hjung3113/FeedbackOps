let nextClientIdSequence = 0;

export function createClientId(prefix: string): string {
  nextClientIdSequence += 1;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return `${prefix}${crypto.randomUUID()}-${nextClientIdSequence}`;
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const randomParts = crypto.getRandomValues(new Uint32Array(4));
    return `${prefix}${Array.from(randomParts, (part) => part.toString(36)).join('-')}-${nextClientIdSequence}`;
  }
  return `${prefix}${Date.now().toString(36)}-${nextClientIdSequence.toString(36)}`;
}
