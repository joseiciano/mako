import { describe, expect, it } from 'vitest'
import { hasSignupErrors, validateSignupForm } from './signup-smart'

describe('validateSignupForm', function () {
  it('returns no errors when values are valid', function () {
    const result = validateSignupForm({
      name: 'Jose',
      email: 'jose@example.com',
      password: 'password123',
    })

    expect(result).toEqual({})
    expect(hasSignupErrors(result)).toBe(false)
  })

  it('returns validation errors for invalid values', function () {
    const result = validateSignupForm({
      name: 'J',
      email: 'jose-at-example.com',
      password: '123',
    })

    expect(result.name).toBe('Name must be at least 2 characters.')
    expect(result.email).toBe('Enter a valid email address.')
    expect(result.password).toBe('Password must be at least 8 characters.')
    expect(hasSignupErrors(result)).toBe(true)
  })
})
