import { randomUUID } from 'node:crypto';

export function uid(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export { randomUUID };
