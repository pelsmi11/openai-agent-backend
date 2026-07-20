import type { Request, Response } from 'express';
import { askToHector } from './booking.service.js';

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
