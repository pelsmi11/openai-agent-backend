import express from 'express';
import { askToHectorController } from './booking.controller.js';

const router = express.Router();

// Monta el router de admin bajo /admin
router.post('/ask-to-hector', askToHectorController);

export default router;
