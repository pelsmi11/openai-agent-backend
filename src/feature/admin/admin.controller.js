import express from 'express';
import {
  createPersonalInfo,
  findSimilarPersonalInfo,
} from './admin.service.js';

const router = express.Router();

/**
 * Controller for handling POST /admin/personal-info requests.
 * Receives content and category in the request body and creates a new personal info entry.
 *
 * @param {express.Request} req - The Express request object.
 * @param {express.Response} res - The Express response object.
 */
export const personalInfoController = async (req, res) => {
  const { content, category } = req.body;
  if (!content || !category) {
    return res.status(400).json({ error: 'content and category are required' });
  }
  try {
    const result = await createPersonalInfo(content, category);
    res.status(201).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ error: error.message || 'Error inserting personal info' });
  }
};

/**
 * Controller for handling GET /admin/search-personal-info requests.
 * Receives a query string (q) and optional count and threshold, and returns similar personal info entries.
 *
 * @param {express.Request} req - The Express request object.
 * @param {express.Response} res - The Express response object.
 */
export const searchPersonalInfoController = async (req, res) => {
  const { q, count, threshold } = req.query;
  if (!q) {
    return res.status(400).json({ error: 'q (query) is required' });
  }
  const matchCount = count ? parseInt(count, 10) : 3;
  const matchThreshold = threshold ? parseFloat(threshold) : 0.9999;
  try {
    const results = await findSimilarPersonalInfo(
      q,
      matchCount,
      matchThreshold,
    );
    res.json(results);
  } catch (error) {
    res
      .status(500)
      .json({ error: error.message || 'Error searching personal info' });
  }
};
