import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProfileDumb } from './profile-dumb'

describe('ProfileDumb', function profileDumbSuite() {
  it('renders provided danger zone section', function testDangerZoneRender() {
    render(
      <ProfileDumb
        dangerZone={
          <section>
            <h2>Danger Zone</h2>
          </section>
        }
      />,
    )

    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        name: 'Danger Zone',
      }),
    ).toBeInTheDocument()
  })
})
