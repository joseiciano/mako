export type EmploymentFieldErrors = {
  companyName: string | null
  role: string | null
  startDate: string | null
  endDate: string | null
}

export function getEmploymentFieldErrors(input: {
  companyName: string
  role: string
  startDate: string
  endDate: string
}): EmploymentFieldErrors {
  return {
    companyName:
      input.companyName.trim().length > 0 ? null : 'Company is required',
    role: input.role.trim().length > 0 ? null : 'Role is required',
    startDate: getRequiredDateError(input.startDate, 'Start date'),
    endDate: getEndDateError(input.startDate, input.endDate),
  }
}

function getRequiredDateError(value: string, label: string): string | null {
  if (value.trim().length === 0) {
    return `${label} is required`
  }

  if (!isDateOnly(value)) {
    return `${label} must be a valid YYYY-MM-DD date`
  }

  return null
}

function getEndDateError(startDate: string, endDate: string): string | null {
  if (endDate.trim().length === 0) {
    return null
  }

  if (!isDateOnly(endDate)) {
    return 'End date must be a valid YYYY-MM-DD date'
  }

  if (isDateOnly(startDate) && endDate < startDate) {
    return 'End date must not be before start date'
  }

  return null
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}
