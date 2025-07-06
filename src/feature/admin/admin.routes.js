import express from 'express';
import {
  personalInfoController,
  searchPersonalInfoController,
} from './admin.controller.js';

const router = express.Router();

// Monta el router de admin bajo /admin
router.post('/personal-info', personalInfoController);
router.get('/search-personal-info', searchPersonalInfoController);

export default router;
