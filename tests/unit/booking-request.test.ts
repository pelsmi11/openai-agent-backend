import { describe, expect, it } from 'vitest';
import { AskToHectorRequestSchema } from '../../src/feature/booking/booking.controller.js';

describe('AskToHectorRequestSchema', () => {
  it('trims a valid backwards-compatible request', () => {
    const parsed = AskToHectorRequestSchema.parse({ message: '  Hola  ' });
    expect(parsed).toEqual({ message: 'Hola' });
  });

  it('rejects empty, oversized and invalid conversation ids', () => {
    expect(AskToHectorRequestSchema.safeParse({ message: ' ' }).success).toBe(false);
    expect(AskToHectorRequestSchema.safeParse({ message: 'a'.repeat(2_001) }).success).toBe(false);
    expect(
      AskToHectorRequestSchema.safeParse({ message: 'Hola', conversationId: 'not-a-uuid' }).success,
    ).toBe(false);
  });
});
