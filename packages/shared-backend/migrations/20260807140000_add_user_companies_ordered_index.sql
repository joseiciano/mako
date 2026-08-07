-- Composite partial index supporting the extended ORDER BY clause in getCompaniesByUserId.
-- Query: ORDER BY joined DESC, created_at DESC, id ASC WHERE deleted_at IS NULL

CREATE INDEX IF NOT EXISTS idx_user_companies_user_active_ordered
  ON user_companies (user_id, joined DESC, created_at DESC, id ASC)
  WHERE deleted_at IS NULL;
