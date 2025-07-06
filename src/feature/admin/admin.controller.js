import express from 'express';
import {
  createPersonalInfo,
  findSimilarPersonalInfo,
} from './admin.service.js';

const router = express.Router();

// POST /admin/personal-info
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

// GET /admin/search-personal-info
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
