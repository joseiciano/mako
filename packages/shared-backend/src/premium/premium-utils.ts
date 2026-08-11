import { ZodError } from 'zod'
import { createSqlQuery, type SqlQueryExecutor } from '../index'

export function isZodError(error: unknown): error is { issues: unknown[] } {
  // @mako/shared resolves a different zod copy (v4) than this package (v3),
  // so instanceof checks fail for errors thrown by shared schemas.
  return (
    error instanceof ZodError ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { name?: unknown }).name === 'ZodError')
  )
}

export async function rollbackTransactionSafely(
  queryExecutor: SqlQueryExecutor,
): Promise<void> {
  try {
    await queryExecutor.query(createSqlQuery('ROLLBACK;'))
  } catch {}
}

export function isSerializationConflict(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: string }).code
    return code === '40001' || code === '40P01'
  }

  return false
}
