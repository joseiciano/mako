import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LoginDumb } from './login/login-dumb'
import { SignupDumb } from './signup/signup-dumb'
import { VerifyEmailDumb } from './verify-email/verify-email-dumb'

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


describe('verify email page copy', function () {
  it('renders enumeration-safe verification copy with a link to log in', function () {
    const html = renderToString(<VerifyEmailDumb />)

    expect(html).toMatch(/check your email/i)
    expect(html).toMatch(/if an account is eligible/i)
    expect(html).toMatch(/delivery may take a few minutes/i)
    expect(html).toMatch(/sign in with the correct password/i)
    expect(html).toContain('href="/login"')
    expect(html).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/)
  })

  it('exposes the verification copy through an accessible status region', function () {
    const html = renderToString(<VerifyEmailDumb />)

    expect(html).toContain('role="status"')
  })
})

describe('login callback banners', function () {
  it('renders the verified callback banner as an accessible status message', function () {
    const html = renderToString(
      <LoginDumb
        values={{ email: '', password: '' }}
        errors={{}}
        formError={null}
        isSubmitting={false}
        search={{ verified: true }}
        onValueChange={function noop() {
          return undefined
        }}
        onSubmit={function noop(event) {
          event.preventDefault()
        }}
      />,
    )

    expect(html).toContain('role="status"')
    expect(html).toMatch(/verif/i)
  })

  it('renders the expired-link banner with guidance instead of the raw query value', function () {
    const html = renderToString(
      <LoginDumb
        values={{ email: '', password: '' }}
        errors={{}}
        formError={null}
        isSubmitting={false}
        search={{ error: 'TOKEN_EXPIRED' }}
        onValueChange={function noop() {
          return undefined
        }}
        onSubmit={function noop(event) {
          event.preventDefault()
        }}
      />,
    )

    expect(html).toContain('role="alert"')
    expect(html).toMatch(/expired/i)
    expect(html).not.toContain('TOKEN_EXPIRED')
  })

  it('renders the invalid-link banner with guidance instead of the raw query value', function () {
    const html = renderToString(
      <LoginDumb
        values={{ email: '', password: '' }}
        errors={{}}
        formError={null}
        isSubmitting={false}
        search={{ error: 'INVALID_TOKEN' }}
        onValueChange={function noop() {
          return undefined
        }}
        onSubmit={function noop(event) {
          event.preventDefault()
        }}
      />,
    )

    expect(html).toContain('role="alert"')
    expect(html).toMatch(/invalid/i)
    expect(html).not.toContain('INVALID_TOKEN')
  })

  it('shows only the link-error banner when verified and error are both present', function () {
    const html = renderToString(
      <LoginDumb
        values={{ email: '', password: '' }}
        errors={{}}
        formError={null}
        isSubmitting={false}
        search={{ verified: true, error: 'TOKEN_EXPIRED' }}
        onValueChange={function noop() {
          return undefined
        }}
        onSubmit={function noop(event) {
          event.preventDefault()
        }}
      />,
    )

    expect(html).toMatch(/expired/i)
    expect(html).not.toContain('role="status"')
  })
})
