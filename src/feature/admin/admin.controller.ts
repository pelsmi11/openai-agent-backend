import type { Request, Response } from 'express';
import { EMBEDDING_SEARCH_DEFAULTS } from '../../utils/constants/dafultvalues.js';
import {
  createPersonalInfo,
  findSimilarPersonalInfo,
} from './admin.service.js';

/**
 * Controller for handling POST /admin/personal-info requests.
 * Receives content and category in the request body and creates a new personal info entry.
 *
 * @param req - The Express request object.
 * @param res - The Express response object.
 */
export const personalInfoController = async (req: Request, res: Response) => {
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
      .json({ error: error instanceof Error ? error.message : 'Error inserting personal info' });
  }
};

/**
 * Controller for handling GET /admin/search-personal-info requests.
 * Receives a query string (q) and optional count and threshold, and returns similar personal info entries.
 *
 * @param req - The Express request object.
 * @param res - The Express response object.
 */
export const searchPersonalInfoController = async (req: Request, res: Response) => {
  const { q, count, minSimilarity, threshold } = req.query;
  if (!q) {
    return res.status(400).json({ error: 'q (query) is required' });
  }
  const matchCount = count ? parseInt(count as string, 10) : 3;
  // `threshold` remains a one-release compatibility alias, now with explicit
  // minimum-similarity semantics just like `minSimilarity`.
  const similarityValue = minSimilarity ?? threshold;
  const minimumSimilarity = similarityValue
    ? parseFloat(similarityValue as string)
    : EMBEDDING_SEARCH_DEFAULTS.min_similarity;
  if (!Number.isInteger(matchCount) || matchCount < 1 || matchCount > 20) {
    return res.status(400).json({ error: 'count must be an integer between 1 and 20' });
  }
  if (!Number.isFinite(minimumSimilarity) || minimumSimilarity < 0 || minimumSimilarity > 1) {
    return res.status(400).json({ error: 'minSimilarity must be between 0 and 1' });
  }
  try {
    const results = await findSimilarPersonalInfo(
      q as string,
      matchCount,
      minimumSimilarity,
    );
    res.json(results);
  } catch (error) {
    res
      .status(500)
      .json({ error: error instanceof Error ? error.message : 'Error searching personal info' });
  }
};
