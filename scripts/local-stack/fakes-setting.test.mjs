import { describe, expect, it } from 'vitest'
import { isFakesEnabled } from './fakes-setting.mjs'

describe('isFakesEnabled', () => {
  it('is off when nothing is set', () => {
    expect(isFakesEnabled({}, '')).toBe(false)
  })

  it('is off for a commented .env example and for other values', () => {
    expect(isFakesEnabled({}, '# LOCAL_FAKES=1\n')).toBe(false)
    expect(isFakesEnabled({ LOCAL_FAKES: '0' })).toBe(false)
    expect(isFakesEnabled({ LOCAL_FAKES: 'yes' })).toBe(false)
  })

  it('turns on from the shell or from .env', () => {
    expect(isFakesEnabled({ LOCAL_FAKES: '1' })).toBe(true)
    expect(isFakesEnabled({ LOCAL_FAKES: 'true' })).toBe(true)
    expect(isFakesEnabled({}, 'A=b\nLOCAL_FAKES="1"\n')).toBe(true)
  })

  it('lets the shell override .env', () => {
    expect(isFakesEnabled({ LOCAL_FAKES: '0' }, 'LOCAL_FAKES=1')).toBe(false)
  })
})
