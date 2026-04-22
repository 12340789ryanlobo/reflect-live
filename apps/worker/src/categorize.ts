import type { Category } from '@reflect-live/shared';

export function categorize(body: string | null | undefined): Category {
  const b = (body ?? '').trim().toLowerCase();
  if (b.startsWith('workout')) return 'workout';
  if (b.startsWith('rehab')) return 'rehab';
  if (/^\d{1,2}\b/.test(b)) return 'survey';
  return 'chat';
}
