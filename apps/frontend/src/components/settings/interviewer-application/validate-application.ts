import { interviewerApplicationRequestSchema } from '@mako/shared'

export type ApplicationFormErrors = {
  email?: string
  selection?: string
  submit?: string
}

export function validateApplication(
  email: string,
  employmentRecordIds: string[],
): ApplicationFormErrors {
  const errors: ApplicationFormErrors = {}
  const result = interviewerApplicationRequestSchema.safeParse({
    email: email.trim(),
    employmentRecordIds,
  })

  if (result.success) return errors

  for (const issue of result.error.issues) {
    const field = issue.path[0]
    if (field === 'email') {
      errors.email ??= 'Enter a valid contact email.'
    } else if (field === 'employmentRecordIds' || field === undefined) {
      errors.selection ??=
        employmentRecordIds.length < 1
          ? 'Select at least one complete employment record.'
          : employmentRecordIds.length > 10
            ? 'Select no more than 10 employment records.'
            : 'Select each employment record only once.'
    }
  }

  return errors
}
