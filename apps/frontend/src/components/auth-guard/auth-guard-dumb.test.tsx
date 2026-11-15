import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuthGuardDumb } from './auth-guard-dumb'

describe('AuthGuardDumb', function () {
  it('renders a loading state while auth is resolving', function () {
    render(
      <AuthGuardDumb isAuthenticated={false} isPending>
        <section>Private Content</section>
      </AuthGuardDumb>,
    )

    expect(screen.getByText('Checking authentication…')).toBeInTheDocument()
    expect(screen.queryByText('Private Content')).not.toBeInTheDocument()
  })

  it('renders children when the user is authenticated', function () {
    render(
      <AuthGuardDumb isAuthenticated isPending={false}>
        <section>Private Content</section>
      </AuthGuardDumb>,
    )

    expect(screen.getByText('Private Content')).toBeInTheDocument()
  })

  it('renders an alert and no children when the session check failed', function () {
    render(
      <AuthGuardDumb error={new Error('boom')} isAuthenticated={false} isPending={false}>
        <section>Private Content</section>
      </AuthGuardDumb>,
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Private Content')).not.toBeInTheDocument()
  })

  it('renders nothing when unauthenticated', function () {
    const { container } = render(
      <AuthGuardDumb isAuthenticated={false} isPending={false}>
        <section>Private Content</section>
      </AuthGuardDumb>,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
