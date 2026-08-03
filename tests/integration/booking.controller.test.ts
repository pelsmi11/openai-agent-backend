import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ask: vi.fn(),
  stream: vi.fn(),
}));

vi.mock('../../src/feature/booking/booking.service.js', () => ({
  askToHector: mocks.ask,
  askToHectorStream: mocks.stream,
}));

import {
  askToHectorController,
  askToHectorStreamController,
} from '../../src/feature/booking/booking.controller.js';

const app = express();
app.use(express.json());
app.post('/booking/ask-to-hector', askToHectorController);
app.post('/booking/ask-to-hector/stream', askToHectorStreamController);

describe('booking controllers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps reply and conversationId while adding evidence metadata', async () => {
    mocks.ask.mockResolvedValue({
      reply: 'Respuesta',
      conversationId: '2ee59962-901a-4a2b-9d4e-25ed301f5180',
      answerParts: [],
      sources: [],
    });
    const response = await request(app)
      .post('/booking/ask-to-hector')
      .send({ message: 'Hola' })
      .expect(200);
    expect(response.body).toMatchObject({ reply: 'Respuesta', answerParts: [], sources: [] });
  });

  it('returns structured 400 errors before invoking the agent', async () => {
    const response = await request(app)
      .post('/booking/ask-to-hector')
      .send({ message: '', conversationId: 'bad' })
      .expect(400);
    expect(response.body.error.code).toBe('INVALID_REQUEST');
    expect(mocks.ask).not.toHaveBeenCalled();
  });

  it('adds answerParts and sources to the final SSE event', async () => {
    async function* tokens() {
      yield 'Hola ';
      yield 'mundo';
    }
    const result = Promise.resolve({ reply: 'Hola mundo', answerParts: [], sources: [] });
    mocks.stream.mockReturnValue({
      conversationId: '2ee59962-901a-4a2b-9d4e-25ed301f5180',
      tokens: tokens(),
      result,
    });
    const response = await request(app)
      .post('/booking/ask-to-hector/stream')
      .send({ message: 'Hola' })
      .expect(200);
    expect(response.text).toContain('"token":"Hola "');
    expect(response.text).toContain('"done":true');
    expect(response.text).toContain('"answerParts":[]');
  });
});
