import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  embedding: vi.fn().mockResolvedValue([0.1, 0.2]),
}));

vi.mock('../../src/lib/pg/client.js', () => ({ pgPool: { query: mocks.query } }));
vi.mock('../../src/feature/booking/openai-embedding.util.js', () => ({
  getEmbedding: mocks.embedding,
}));

import { searchPersonalInfo } from '../../src/feature/booking/personal-info-search.service.js';

describe('searchPersonalInfo', () => {
  beforeEach(() => mocks.query.mockReset());

  it('uses explicit minimum-similarity semantics', async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [{ id: '1', content: 'Dato', category: 'perfil', similarity: '0.81' }],
    });
    const rows = await searchPersonalInfo('consulta', { minSimilarity: 0.7, matchCount: 5 });
    expect(mocks.query).toHaveBeenCalledWith(
      'SELECT * FROM search_personal_info($1, $2, $3)',
      ['[0.1,0.2]', 0.7, 5],
    );
    expect(rows[0]?.similarity).toBe(0.81);
  });

  it('falls back to the legacy distance function during migration rollout', async () => {
    mocks.query
      .mockRejectedValueOnce(Object.assign(new Error('missing'), { code: '42883' }))
      .mockResolvedValueOnce({
        rows: [{ id: '1', content: 'Dato', category: null, similarity: 0.75 }],
      });
    const rows = await searchPersonalInfo('consulta', { minSimilarity: 0.7, matchCount: 3 });
    expect(mocks.query).toHaveBeenLastCalledWith(
      'SELECT * FROM match_personal_info($1, $2, $3)',
      ['[0.1,0.2]', 0.30000000000000004, 3],
    );
    expect(rows).toHaveLength(1);
  });
});
