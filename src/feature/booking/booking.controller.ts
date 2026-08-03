import type { Request, Response } from 'express';
import { z } from 'zod';
import { askToHector, askToHectorStream } from './booking.service.js';

export const AskToHectorRequestSchema = z.object({
  message: z.string().trim().min(1).max(2_000),
  conversationId: z.string().uuid().optional(),
});

function parseRequest(req: Request, res: Response) {
  const parsed = AskToHectorRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'The request body is invalid.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
    });
    return null;
  }
  return parsed.data;
}

/**
 * Controller for handling POST /booking/ask-to-hector requests.
 * Receives a message (and optional conversationId to continue a prior chat) in the request
 * body and returns the agent's reply plus the conversationId to reuse in the next request.
 *
 * @param req - The Express request object.
 * @param res - The Express response object.
 */
export const askToHectorController = async (req: Request, res: Response) => {
  const input = parseRequest(req, res);
  if (!input) return;
  try {
    const result = await askToHector(input.message, input.conversationId);
    res.json(result);
  } catch (error) {
    console.error('[askToHectorController] failed:', error);
    res.status(500).json({
      error: { code: 'AGENT_ERROR', message: 'Unable to process the request right now.' },
    });
  }
};

/**
 * Controller for handling POST /booking/ask-to-hector/stream requests.
 * Same inputs as askToHectorController, but streams the reply as Server-Sent Events instead of
 * waiting for the full response — each event is `data: {"token": "..."}`, followed by a final
 * `data: {"done": true, "conversationId": "..."}`. Errors after the stream has started can't
 * change the HTTP status anymore, so they're sent as a `data: {"error": "..."}` event instead.
 */
export const askToHectorStreamController = async (req: Request, res: Response) => {
  const input = parseRequest(req, res);
  if (!input) return;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const { conversationId: threadId, tokens, result } = askToHectorStream(
    input.message,
    input.conversationId,
  );

  try {
    for await (const token of tokens) {
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
    }
    const completed = await result;
    res.write(
      `data: ${JSON.stringify({
        done: true,
        conversationId: threadId,
        answerParts: completed.answerParts,
        sources: completed.sources,
      })}\n\n`,
    );
  } catch (error) {
    console.error('[askToHectorStreamController] failed:', error);
    res.write(
      `data: ${JSON.stringify({
        error: { code: 'AGENT_ERROR', message: 'Unable to process the request right now.' },
      })}\n\n`,
    );
  } finally {
    res.end();
  }
};
