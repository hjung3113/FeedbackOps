// Escape user text before adding the deliberate LIKE prefix/contains wildcards.
export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}
