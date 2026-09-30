/** Short identifier fragments are for muted secondary details only. */
export function shortId(id: string): string {
  return id.slice(0, 8);
}
