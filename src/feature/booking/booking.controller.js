import express from 'express';
import { askToHector } from './booking.service.js';

const router = express.Router();

/**
 * Controller for handling POST /booking/ask-to-hector requests.
 * Receives a message in the request body and returns the agent's reply.
 *
 * @param {express.Request} req - The Express request object.
 * @param {express.Response} res - The Express response object.
 */
export const askToHectorController = async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }
  try {
    const result = await askToHector(message);
    res.json(result);
  } catch (error) {
    res
      .status(500)
      .json({ error: error.message || 'Error processing request' });
  }
};
