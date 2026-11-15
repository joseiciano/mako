import { describe, expect, it } from 'vitest'
import { validateApplication } from './validate-application'

const id = '11111111-1111-4111-8111-111111111111'

describe('validateApplication', function suite() {
  it('accepts a valid email and selection', function run() {
    expect(validateApplication(' me@example.com ', [id])).toEqual({})
  })

  it.each(['user@example.c', 'a..b@example.com', 'a@b_c.com', 'nope', ''])(
    'rejects %s exactly as the shared schema does',
    function run(email) {
      expect(validateApplication(email, [id])).toEqual({ email: 'Enter a valid contact email.' })
    },
  )

  it('reports selection bounds and duplicates', function run() {
    expect(validateApplication('me@example.com', []).selection).toContain('at least one')
    const many = Array.from({ length: 11 }, function make(_, i) {
      return `11111111-1111-4111-8111-1111111111${String(i).padStart(2, '0')}`
    })
    expect(validateApplication('me@example.com', many).selection).toContain('no more than 10')
    expect(validateApplication('me@example.com', [id, id]).selection).toContain('only once')
  })
})
