import type { Request, Response } from 'express';
import { askToHector, askToHectorStream } from './booking.service.js';

/**
 * Controller for handling POST /booking/ask-to-hector requests.
 * Receives a message (and optional conversationId to continue a prior chat) in the request
 * body and returns the agent's reply plus the conversationId to reuse in the next request.
 *
 * @param req - The Express request object.
 * @param res - The Express response object.
 */
export const askToHectorController = async (req: Request, res: Response) => {
  const { message, conversationId } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }
  try {
    const result = await askToHector(message, conversationId);
    res.json(result);
  } catch (error) {
    res
      .status(500)
      .json({ error: error instanceof Error ? error.message : 'Error processing request' });
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
  const { message, conversationId } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const { conversationId: threadId, tokens } = askToHectorStream(message, conversationId);

  try {
    for await (const token of tokens) {
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ done: true, conversationId: threadId })}\n\n`);
  } catch (error) {
    res.write(
      `data: ${JSON.stringify({
        error: error instanceof Error ? error.message : 'Error processing request',
      })}\n\n`,
    );
  } finally {
    res.end();
  }
};
