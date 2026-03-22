import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LoginDumb } from './login/login-dumb'
import { SignupDumb } from './signup/signup-dumb'

describe('auth dumb components', function () {
  it('renders login form fields and call-to-action text', function () {
    const html = renderToString(
      <LoginDumb
        values={{ email: '', password: '' }}
        errors={{}}
        formError={null}
        isSubmitting={false}
        onValueChange={function noop() {
          return undefined
        }}
        onSubmit={function noop(event) {
          event.preventDefault()
        }}
      />,
    )

    expect(html).toContain('Log in')
    expect(html).toContain('Email')
    expect(html).toContain('Password')
    expect(html).toContain('Create an account')
  })

  it('renders signup form fields and call-to-action text', function () {
    const html = renderToString(
      <SignupDumb
        values={{ name: '', email: '', password: '' }}
        errors={{}}
        formError={null}
        isSubmitting={false}
        onValueChange={function noop() {
          return undefined
        }}
        onSubmit={function noop(event) {
          event.preventDefault()
        }}
      />,
    )

    expect(html).toContain('Create account')
    expect(html).toContain('Name')
    expect(html).toContain('Email')
    expect(html).toContain('Password')
    expect(html).toContain('Log in')
  })
})
