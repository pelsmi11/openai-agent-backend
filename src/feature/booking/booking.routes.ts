import express from 'express';
import { askToHectorController } from './booking.controller.js';

const router = express.Router();

/**
 * Route for handling agent Q&A requests about Hector.
 *
 * POST /booking/ask-to-hector
 * Body: { message: string }
 * Response: { reply: string }
 */
router.post('/ask-to-hector', askToHectorController);

export default router;
