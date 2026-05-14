import { describe, expect, it } from 'vitest'
import * as appShellSmartModule from './app-shell-smart'

describe('app-shell smart module', function () {
  it('does not export auth redirect helpers anymore', function () {
    expect(appShellSmartModule).not.toHaveProperty('shouldRedirectToLogin')
  })
})
