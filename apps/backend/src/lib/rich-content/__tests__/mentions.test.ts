import { describe, expect, it } from 'vitest';

import { validateRichContentMentions } from '../mentions.js';

const ACTOR_ID = '00000000-0000-4000-8000-000000000001';
const invalidActorIdError = new Error('invalid actor id');
const mismatchError = new Error('body and request mentions differ');
const errors = {
  invalidActorId: () => invalidActorIdError,
  bodyRequestMismatch: () => mismatchError,
};

interface MentionCase {
  name: string;
  body: unknown;
  mentions: string[];
  expectedIds?: string[];
  expectedError?: Error;
}

function doc(content: unknown[]) {
  return { type: 'doc', content };
}

function mention(actorId: unknown) {
  return { type: 'mention', attrs: { actor_id: actorId } };
}

const cases: MentionCase[] = [
  {
    name: 'valid nested mention',
    body: doc([{ type: 'paragraph', content: [mention(ACTOR_ID)] }]),
    mentions: [ACTOR_ID],
    expectedIds: [ACTOR_ID],
  },
  {
    name: 'malformed attrs',
    body: doc([{ type: 'paragraph', content: [{ type: 'mention' }] }]),
    mentions: [],
    expectedError: invalidActorIdError,
  },
  {
    name: 'array attrs',
    body: doc([{ type: 'mention', attrs: [] }]),
    mentions: [],
    expectedError: invalidActorIdError,
  },
  {
    name: 'non-UUID actor id',
    body: doc([mention('not-a-uuid')]),
    mentions: ['not-a-uuid'],
    expectedError: invalidActorIdError,
  },
  {
    name: 'body and request mismatch',
    body: doc([mention(ACTOR_ID)]),
    mentions: [],
    expectedError: mismatchError,
  },
  {
    name: 'duplicate body and request ids',
    body: doc([mention(ACTOR_ID), mention(ACTOR_ID)]),
    mentions: [ACTOR_ID, ACTOR_ID],
    expectedIds: [ACTOR_ID],
  },
];

describe('validateRichContentMentions', () => {
  it.each(cases)('$name', ({ body, mentions, expectedIds, expectedError }) => {
    const validate = () => validateRichContentMentions(body, mentions, errors);

    if (expectedError) {
      expect(validate).toThrow(expectedError);
      return;
    }

    expect(validate()).toEqual(expectedIds);
  });
});
