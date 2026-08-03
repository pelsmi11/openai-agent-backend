-- Run outside a transaction because PostgreSQL does not allow CONCURRENTLY in one.
-- The application can use the legacy function until this migration is deployed.

CREATE INDEX CONCURRENTLY IF NOT EXISTS personal_info_embedding_hnsw_cosine
  ON personal_info
  USING hnsw (embedding vector_cosine_ops);

CREATE OR REPLACE FUNCTION search_personal_info(
  query_embedding vector(1536),
  min_similarity float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  content text,
  category text,
  created_at timestamp,
  similarity float
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    id,
    content,
    category,
    created_at,
    1 - (embedding <=> query_embedding) AS similarity
  FROM personal_info
  WHERE visibility = true
    AND 1 - (embedding <=> query_embedding) >= min_similarity
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

DROP INDEX CONCURRENTLY IF EXISTS personal_info_embedding_hnsw;
ALTER INDEX personal_info_embedding_hnsw_cosine RENAME TO personal_info_embedding_hnsw;

DROP FUNCTION IF EXISTS match_personal_info(vector, double precision, integer);
