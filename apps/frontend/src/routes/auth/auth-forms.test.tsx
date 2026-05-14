import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LoginDumb } from './login/login-dumb'
import { SignupDumb } from './signup/signup-dumb'

vi.mock('@tanstack/react-router', function mockTanstackRouter() {
  return {
    Link: function Link(props: {
      children: ReactNode
      className?: string
      to: string
    }) {
      const { children, to, ...anchorProps } = props

      return (
        <a href={to} data-router-link="true" {...anchorProps}>
          {children}
        </a>
      )
    },
  }
})

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
    expect(html).toContain('data-router-link="true"')
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
    expect(html).toContain('data-router-link="true"')
  })
})
