import { describe, expect, it } from 'vitest'
import { getEmploymentFieldErrors } from './validation'

describe('getEmploymentFieldErrors', function validationSuite() {
  describe('companyName', function companyNameSuite() {
    it('returns null for valid company name', function run() {
      const errors = getEmploymentFieldErrors({
        companyName: 'Stripe',
        role: 'Engineer',
        startDate: '2023-01-15',
        endDate: '',
      })

      expect(errors.companyName).toBeNull()
    })

    it('returns error for empty company name', function run() {
      const errors = getEmploymentFieldErrors({
        companyName: '',
        role: 'Engineer',
        startDate: '2023-01-15',
        endDate: '',
      })

      expect(errors.companyName).toBe('Company is required')
    })

    it('returns error for whitespace-only company name', function run() {
      const errors = getEmploymentFieldErrors({
        companyName: '   ',
        role: 'Engineer',
        startDate: '2023-01-15',
        endDate: '',
      })

      expect(errors.companyName).toBe('Company is required')
    })
  })

  describe('role', function roleSuite() {
    it('returns null for valid role', function run() {
      const errors = getEmploymentFieldErrors({
        companyName: 'Stripe',
        role: 'Software Engineer',
        startDate: '2023-01-15',
        endDate: '',
      })

      expect(errors.role).toBeNull()
    })

    it('returns error for empty role', function run() {
      const errors = getEmploymentFieldErrors({
        companyName: 'Stripe',
        role: '',
        startDate: '2023-01-15',
        endDate: '',
      })

      expect(errors.role).toBe('Role is required')
    })

    it('returns error for whitespace-only role', function run() {
      const errors = getEmploymentFieldErrors({
        companyName: 'Stripe',
        role: '  ',
        startDate: '2023-01-15',
        endDate: '',
      })

      expect(errors.role).toBe('Role is required')
    })
  })

  describe('startDate', function startDateSuite() {
    it('returns null for valid date', function run() {
      const errors = getEmploymentFieldErrors({
        companyName: 'Stripe',
        role: 'Engineer',
        startDate: '2023-01-15',
        endDate: '',
      })

      expect(errors.startDate).toBeNull()
    })

    it('returns error for empty start date', function run() {
      const errors = getEmploymentFieldErrors({
        companyName: 'Stripe',
        role: 'Engineer',
        startDate: '',
        endDate: '',
      })

      expect(errors.startDate).toBe('Start date is required')
    })

    it('returns error for whitespace-only start date', function run() {
      const errors = getEmploymentFieldErrors({
        companyName: 'Stripe',
        role: 'Engineer',
        startDate: '  ',
        endDate: '',
      })

      expect(errors.startDate).toBe('Start date is required')
    })

    it('returns error for invalid date format', function run() {
      const errors = getEmploymentFieldErrors({
        companyName: 'Stripe',
        role: 'Engineer',
        startDate: 'not-a-date',
        endDate: '',
      })

      expect(errors.startDate).toBe('Start date must be a valid YYYY-MM-DD date')
    })

    it('returns error for wrong format (slashes)', function run() {
      const errors = getEmploymentFieldErrors({
        companyName: 'Stripe',
        role: 'Engineer',
        startDate: '2023/01/15',
        endDate: '',
      })

      expect(errors.startDate).toBe('Start date must be a valid YYYY-MM-DD date')
    })

    it('returns error for invalid calendar date (Feb 30)', function run() {
      const errors = getEmploymentFieldErrors({
        companyName: 'Stripe',
        role: 'Engineer',
        startDate: '2023-02-30',
        endDate: '',
      })

      expect(errors.startDate).toBe('Start date must be a valid YYYY-MM-DD date')
    })

    it('returns error for invalid calendar date (month 13)', function run() {
      const errors = getEmploymentFieldErrors({
        companyName: 'Stripe',
        role: 'Engineer',
        startDate: '2023-13-01',
        endDate: '',
      })

      expect(errors.startDate).toBe('Start date must be a valid YYYY-MM-DD date')
    })
  })

  describe('endDate', function endDateSuite() {
    it('returns null when end date is empty (current role)', function run() {
      const errors = getEmploymentFieldErrors({
        companyName: 'Stripe',
        role: 'Engineer',
        startDate: '2023-01-15',
        endDate: '',
      })

      expect(errors.endDate).toBeNull()
    })

    it('returns null when end date is whitespace', function run() {
      const errors = getEmploymentFieldErrors({
        companyName: 'Stripe',
        role: 'Engineer',
        startDate: '2023-01-15',
        endDate: '  ',
      })

      expect(errors.endDate).toBeNull()
    })

    it('returns null for valid end date after start date', function run() {
      const errors = getEmploymentFieldErrors({
        companyName: 'Stripe',
        role: 'Engineer',
        startDate: '2023-01-15',
        endDate: '2024-03-01',
      })

      expect(errors.endDate).toBeNull()
    })

    it('returns null for same start and end date', function run() {
      const errors = getEmploymentFieldErrors({
        companyName: 'Stripe',
        role: 'Engineer',
        startDate: '2023-01-15',
        endDate: '2023-01-15',
      })

      expect(errors.endDate).toBeNull()
    })

    it('returns error for invalid end date format', function run() {
      const errors = getEmploymentFieldErrors({
        companyName: 'Stripe',
        role: 'Engineer',
        startDate: '2023-01-15',
        endDate: 'not-a-date',
      })

      expect(errors.endDate).toBe('End date must be a valid YYYY-MM-DD date')
    })

    it('returns error for end date before start date', function run() {
      const errors = getEmploymentFieldErrors({
        companyName: 'Stripe',
        role: 'Engineer',
        startDate: '2023-06-01',
        endDate: '2023-01-15',
      })

      expect(errors.endDate).toBe('End date must not be before start date')
    })

    it('does not compare when start date is invalid', function run() {
      const errors = getEmploymentFieldErrors({
        companyName: 'Stripe',
        role: 'Engineer',
        startDate: 'bad-date',
        endDate: '2023-01-15',
      })

      expect(errors.endDate).toBeNull()
    })
  })

  describe('all fields valid', function allValidSuite() {
    it('returns all null errors for complete valid input', function run() {
      const errors = getEmploymentFieldErrors({
        companyName: 'Stripe',
        role: 'Software Engineer',
        startDate: '2023-01-15',
        endDate: '2024-06-30',
      })

      expect(errors).toEqual({
        companyName: null,
        role: null,
        startDate: null,
        endDate: null,
      })
    })

    it('returns all null errors for current role (no end date)', function run() {
      const errors = getEmploymentFieldErrors({
        companyName: 'Stripe',
        role: 'Software Engineer',
        startDate: '2023-01-15',
        endDate: '',
      })

      expect(errors).toEqual({
        companyName: null,
        role: null,
        startDate: null,
        endDate: null,
      })
    })
  })
})
