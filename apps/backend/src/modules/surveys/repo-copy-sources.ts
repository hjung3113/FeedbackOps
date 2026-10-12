import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../../db/tx.js';
import { HttpError } from '../../lib/errors.js';

const cursorSchema = z
  .object({
    created_at: z
      .string()
      .datetime({ offset: true })
      .refine((value) => {
        const offset = /[+-](\d{2}):(\d{2})$/.exec(value);
        const calendarDate = value.slice(0, 10);
        return (
          Number.isFinite(Date.parse(value)) &&
          !calendarDate.startsWith('0000') &&
          new Date(calendarDate).toISOString().slice(0, 10) === calendarDate &&
          (!offset || (Number(offset[1]) <= 15 && Number(offset[2]) <= 59))
        );
      }),
    id: z.string().uuid(),
  })
  .strict();
export type CopySourcesQuery = {
  managed_system_id: string;
  q?: string;
  limit: number;
  cursor?: string;
};

export function decodeCopySourceCursor(raw: string) {
  try {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw new Error('encoding');
    return cursorSchema.parse(JSON.parse(Buffer.from(raw, 'base64').toString('utf8')));
  } catch {
    throw new HttpError('validation.failed', 'invalid cursor', {
      fields: [{ path: ['cursor'], code: 'invalid_cursor' }],
    });
  }
}

/** Metadata-only eligibility predicate; definitions are loaded only for the selected source. */
export async function listCopySources(tx: Tx, workspaceId: string, query: CopySourcesQuery) {
  const cursor = query.cursor ? decodeCopySourceCursor(query.cursor) : null;
  const after = cursor
    ? sql`and (s.created_at,s.id)<(${cursor.created_at}::timestamptz,${cursor.id}::uuid)`
    : sql``;
  const search = query.q
    ? sql`and (s.title ilike ${`%${query.q.replace(/[\\%_]/g, '\\$&')}%`} or s.display_id ilike ${`%${query.q.replace(/[\\%_]/g, '\\$&')}%`})`
    : sql``;
  const result = await tx.execute<{
    survey_id: string;
    display_id: string;
    title: string;
    type: 'discovery' | 'validation' | 'outcome';
    status: 'draft' | 'open' | 'closed';
    question_count: number;
    created_at: string;
  }>(sql`
    select s.id as survey_id,s.display_id,s.title,s.type,s.status,
      d.question_count, to_char(s.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at
    from survey.surveys s
    cross join lateral (
      select count(*)::int as question_count,
        count(distinct q.sort_order) as distinct_order,
        min(q.sort_order) as first_order,max(q.sort_order) as last_order,
        bool_and(
          length(q.prompt)>0 and
          case when q.kind in ('single_choice','multiple_choice') then
            case when jsonb_typeof(q.options)='array' then
              jsonb_array_length(q.options) between 2 and 50 and
              not exists (select 1 from jsonb_array_elements(q.options) o where jsonb_typeof(o->'key') is distinct from 'string' or jsonb_typeof(o->'label') is distinct from 'string' or length(o->>'key')=0 or length(o->>'label')=0 or case when jsonb_typeof(o)='object' then (o-'key'-'label') <> '{}'::jsonb else true end) and
              (select count(distinct o->>'key') from jsonb_array_elements(q.options) o)=jsonb_array_length(q.options)
            else false end
          else q.options is null end and
          case when q.kind='rating' then q.rating_min is not null and q.rating_max is not null and q.rating_min>=0 and q.rating_max<=10 and q.rating_min<q.rating_max
          else q.rating_min is null and q.rating_max is null and q.rating_low_label is null and q.rating_high_label is null end and
          (q.branch_depth=0 or exists (
            select 1 from survey.survey_questions p
            where p.workspace_id=s.workspace_id and p.survey_id=s.id and p.id=q.branch_parent_question_id
              and p.kind='single_choice' and p.branch_depth=0
              and case when jsonb_typeof(p.options)='array' then exists (select 1 from jsonb_array_elements(p.options) o where o->>'key'=q.branch_trigger_option_key) else false end
          ))
        ) as valid
      from survey.survey_questions q where q.workspace_id=s.workspace_id and q.survey_id=s.id
    ) d
    where s.workspace_id=${workspaceId} and s.primary_managed_system_id=${query.managed_system_id}
      and s.status in ('draft','open','closed') and d.question_count>0 and d.valid
      and d.distinct_order=d.question_count and d.first_order=0 and d.last_order=d.question_count-1
      ${after} ${search}
    order by s.created_at desc,s.id desc limit ${query.limit + 1}
  `);
  const hasMore = result.rows.length > query.limit;
  const visible = result.rows.slice(0, query.limit);
  const last = visible.at(-1);
  return {
    items: visible.map(({ created_at: _created, ...item }) => item),
    page: {
      has_more: hasMore,
      ...(hasMore && last
        ? {
            cursor: Buffer.from(
              JSON.stringify({ created_at: last.created_at, id: last.survey_id }),
            ).toString('base64'),
          }
        : {}),
    },
  };
}
