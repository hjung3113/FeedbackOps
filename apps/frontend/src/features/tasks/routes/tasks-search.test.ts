// /tasks search schema — Milestones view mount (#514 B2a).
//
// docs/frontend/routes-and-layout.md §Task route views plus the #514 design
// (§7 item 8, §11.1): selection rides `param` like every shipped Task view;
// `selected` is not a /tasks key and the schema stays strict, so `roadmap`
// and `selected` keep failing.
import { describe, expect, test } from 'vitest';

import { tasksSearchSchema } from '@/routes/_authed/tasks';

const MS_ID = '99999999-9999-9999-9999-999999999901';

describe('tasksSearchSchema', () => {
  test('parses view=milestones with managedSystem scope and param selection', () => {
    expect(
      tasksSearchSchema.parse({ view: 'milestones', managedSystem: MS_ID, param: 'm-1' }),
    ).toEqual({ view: 'milestones', managedSystem: MS_ID, param: 'm-1' });
  });

  test('still rejects view=roadmap', () => {
    expect(() => tasksSearchSchema.parse({ view: 'roadmap' })).toThrow();
  });

  test('still rejects selected', () => {
    expect(() => tasksSearchSchema.parse({ selected: 'm-1' })).toThrow();
  });
});
