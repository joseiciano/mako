import { describe, expect, it } from 'vitest'
import { hasLoginErrors, validateLoginForm } from './login-smart'

describe('validateLoginForm', function () {
  it('returns no errors when values are valid', function () {
    const result = validateLoginForm({
      email: 'jose@example.com',
      password: 'strong-password',
    })

    expect(result).toEqual({})
    expect(hasLoginErrors(result)).toBe(false)
  })

  it('returns validation errors for missing and invalid values', function () {
    const result = validateLoginForm({
      email: 'invalid-email',
      password: '',
    })

    expect(result.email).toBe('Enter a valid email address.')
    expect(result.password).toBe('Password is required.')
    expect(hasLoginErrors(result)).toBe(true)
  })
})
