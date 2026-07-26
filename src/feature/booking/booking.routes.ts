import express from 'express';
import { askToHectorController, askToHectorStreamController } from './booking.controller.js';

const router = express.Router();

/**
 * Route for handling agent Q&A requests about Hector.
 *
 * POST /booking/ask-to-hector
 * Body: { message: string, conversationId?: string }
 * Response: { reply: string, conversationId: string }
 */
router.post('/ask-to-hector', askToHectorController);

/**
 * Streaming variant: same body, but responds with Server-Sent Events instead of a single JSON
 * payload — one `data: {"token": "..."}` per chunk, then `data: {"done": true, "conversationId": "..."}`.
 *
 * POST /booking/ask-to-hector/stream
 * Body: { message: string, conversationId?: string }
 */
router.post('/ask-to-hector/stream', askToHectorStreamController);

export default router;
