import { describe, expect, it } from 'vitest'
import {
  AuthUnavailableError,
  DatabaseUnavailableError,
  classifyFailure,
} from './failure-classification'

describe('classifyFailure', function () {
  it('classifies auth and database unavailability as unavailable', function () {
    expect(classifyFailure(new AuthUnavailableError())).toBe('unavailable')
    expect(classifyFailure(new DatabaseUnavailableError())).toBe('unavailable')
  })

  it.each(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', '08006', '08001', '57P01', '53300'])(
    'classifies code %s as unavailable',
    function (code) {
      expect(classifyFailure(Object.assign(new Error('x'), { code }))).toBe('unavailable')
    },
  )

  it('classifies a wrapped connectivity cause and connection messages as unavailable', function () {
    expect(
      classifyFailure(new Error('wrapper', { cause: Object.assign(new Error('x'), { code: 'ECONNRESET' }) })),
    ).toBe('unavailable')
    expect(classifyFailure(new Error('Connection terminated unexpectedly'))).toBe('unavailable')
  })

  it.each(['42P01', '22P02', '23505', '42703'])(
    'keeps query error code %s as internal (500)',
    function (code) {
      expect(classifyFailure(Object.assign(new Error('bad query'), { code }))).toBe('internal')
    },
  )

  it('keeps programming errors internal', function () {
    expect(classifyFailure(new TypeError('undefined is not a function'))).toBe('internal')
    expect(classifyFailure('string')).toBe('internal')
  })
})
