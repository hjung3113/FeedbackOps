const KOREAN_TIME_ZONE = 'Asia/Seoul';

function parseTimestamp(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTimestamp(iso: string, options: Intl.DateTimeFormatOptions): string {
  const date = parseTimestamp(iso);
  if (date === null) return '—';

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: KOREAN_TIME_ZONE,
    ...options,
  }).format(date);
}

function formatCalendarDate(date: Date): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: KOREAN_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(date);
}

export function formatRelativeTime(iso: string): string {
  const date = parseTimestamp(iso);
  if (date === null) return '—';

  const diffMs = date.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  const relativeTime = new Intl.RelativeTimeFormat('ko-KR', { numeric: 'auto' });
  if (Math.abs(diffMin) < 60) return relativeTime.format(diffMin, 'minute');

  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return relativeTime.format(diffHour, 'hour');

  return relativeTime.format(Math.round(diffHour / 24), 'day');
}

export function formatDate(iso: string): string {
  return formatTimestamp(iso, { year: 'numeric', month: 'numeric', day: 'numeric' });
}

export function formatShortDate(iso: string): string {
  return formatTimestamp(iso, { month: 'long', day: 'numeric' });
}

export function formatDateTime(iso: string): string {
  return formatTimestamp(iso, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatShortDateTime(iso: string): string {
  return formatTimestamp(iso, {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatTime(iso: string): string {
  return formatTimestamp(iso, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDateOnly(dateOnly: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return '—';

  const date = new Date(`${dateOnly}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || !date.toISOString().startsWith(`${dateOnly}T`)) return '—';

  return formatCalendarDate(date);
}
