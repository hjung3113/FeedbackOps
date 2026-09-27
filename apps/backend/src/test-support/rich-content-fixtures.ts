export function paragraphDoc(text: string) {
  return {
    type: 'doc' as const,
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}
