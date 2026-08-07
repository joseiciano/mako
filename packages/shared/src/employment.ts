import { z } from 'zod'

// Date-only string schema (YYYY-MM-DD)
const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a YYYY-MM-DD date string')

// Company name: trim, min 1, max 120, normalize to lowercase
export const employmentCompanyNameSchema = z
  .string()
  .trim()
  .min(1, 'Company is required')
  .max(120, 'Company must be 120 characters or fewer')
  .transform(function normalizeCompanyName(value) {
    return value.toLowerCase()
  })

// Role: trim, min 1, max 200
export const employmentRoleSchema = z
  .string()
  .trim()
  .min(1, 'Role is required')
  .max(200, 'Role must be 200 characters or fewer')

// Canonical create/update input: { company, role, start, end }
export const employmentRecordInputSchema = z
  .object({
    company: employmentCompanyNameSchema,
    role: employmentRoleSchema,
    start: dateOnlySchema,
    end: dateOnlySchema.nullable(),
  })
  .strict()
  .refine(function endNotBeforeStart(data) {
    if (data.end === null) return true
    return data.end >= data.start
  }, 'End date must not be before start date')

export type EmploymentRecordInput = z.infer<typeof employmentRecordInputSchema>

// Canonical EmploymentRecord (read/write contract)
export const employmentRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  company: z.string(),
  role: z.string().nullable(),
  start: dateOnlySchema,
  end: dateOnlySchema.nullable(),
  isComplete: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type EmploymentRecord = z.infer<typeof employmentRecordSchema>

// Compatibility response: EmploymentRecord + deprecated joined ISO-8601 alias
// Temporary for Milestone 7 only. joined is REQUIRED (non-null) on every record.
export const employmentRecordCompatibilityResponseSchema = employmentRecordSchema.extend({
  joined: z.string().datetime(),
})

export type EmploymentRecordCompatibilityResponse = z.infer<
  typeof employmentRecordCompatibilityResponseSchema
>

// EmploymentHistorySnapshot for NEW submissions: sourceCompanyId is non-null UUID
export const employmentHistorySnapshotSchema = z.object({
  sourceCompanyId: z.string().uuid(),
  company: z.string().min(1),
  role: z.string().min(1),
  start: dateOnlySchema,
  end: dateOnlySchema.nullable(),
})

export type EmploymentHistorySnapshot = z.infer<typeof employmentHistorySnapshotSchema>

// Legacy-compatible application response/read snapshot: sourceCompanyId may be null
export const employmentHistorySnapshotReadSchema = z.object({
  sourceCompanyId: z.string().uuid().nullable(),
  company: z.string().min(1),
  role: z.string().min(1),
  start: dateOnlySchema,
  end: dateOnlySchema.nullable(),
})

export type EmploymentHistorySnapshotRead = z.infer<
  typeof employmentHistorySnapshotReadSchema
>
