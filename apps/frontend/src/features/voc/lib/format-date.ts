import { formatRelativeTime } from '@/lib/datetime';

export function formatVocCreatedAt(iso: string): string {
  return formatRelativeTime(iso);
}
