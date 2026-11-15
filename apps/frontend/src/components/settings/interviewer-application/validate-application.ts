import type { ApplicationFormErrors } from './application-form-dumb'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateApplication(
  email: string,
  employmentRecordIds: string[],
): ApplicationFormErrors {
  const errors: ApplicationFormErrors = {}

  if (employmentRecordIds.length < 1) {
    errors.selection = 'Select at least one complete employment record.'
  } else if (employmentRecordIds.length > 10) {
    errors.selection = 'Select no more than 10 employment records.'
  }

  if (!emailPattern.test(email.trim())) {
    errors.email = 'Enter a valid contact email.'
  }

  return errors
}
