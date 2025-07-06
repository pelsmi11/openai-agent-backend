import express from 'express';
import {
  personalInfoController,
  searchPersonalInfoController,
} from './admin.controller.js';

const router = express.Router();

/**
 * Admin routes for managing and searching personal info.
 *
 * POST /admin/personal-info - Create a new personal info entry.
 * GET /admin/search-personal-info - Search for similar personal info entries.
 */
router.post('/personal-info', personalInfoController);
router.get('/search-personal-info', searchPersonalInfoController);

export default router;
