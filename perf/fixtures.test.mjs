import { describe, expect, it } from 'vitest';
import { createEmptySession } from '../src/app/sessionState';
import { deserializeSession, serializeSession } from '../src/services/persistenceCodec';
import { prepareSession } from './fixtures.mjs';

describe('perf recovery fixture', () => {
  it('produces a session the current codec saves and recovers', () => {
    const empty = () => createEmptySession({ name: 'perf.pdf', size: 1, lastModified: 1 }, 1);
    const defaults = empty().pages[1].nextMeasurementNumber;
    const recovered = deserializeSession(serializeSession(prepareSession(empty(), 200)));
    expect(recovered.pages[1].measurements).toHaveLength(200);
    expect(recovered.pages[1].nextMeasurementNumber).toEqual({ ...defaults, line: 201, polyline: 201, polygon: 201 });
  });
});
