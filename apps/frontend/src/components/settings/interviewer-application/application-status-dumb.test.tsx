import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { InterviewerApplication } from '@mako/shared'
import { ApplicationStatusDumb } from './application-status-dumb'

function build(overrides: Partial<InterviewerApplication> = {}): InterviewerApplication {
  return {
    applicationId: '33333333-3333-4333-8333-333333333333',
    email: 'apply@example.com',
    status: 'pending',
    createdAt: '2026-08-07T20:00:00.000Z',
    updatedAt: '2026-08-07T20:00:00.000Z',
    employmentHistory: [
      {
        sourceCompanyId: '11111111-1111-4111-8111-111111111111',
        company: 'Acme',
        role: 'Engineer',
        start: '2020-01-01',
        end: null,
      },
      {
        sourceCompanyId: null,
        company: 'Globex',
        role: 'Intern',
        start: '2018-06-01',
        end: '2019-01-31',
      },
    ],
    ...overrides,
  }
}

describe('ApplicationStatusDumb', function suite() {
  it('renders the snapshot with Present for a null end date', function run() {
    render(<ApplicationStatusDumb application={build()} />)
    expect(screen.getByText('Acme')).toBeTruthy()
    expect(screen.getByText('2020-01-01 — Present')).toBeTruthy()
    expect(screen.getByText('2018-06-01 — 2019-01-31')).toBeTruthy()
    expect(screen.getByText('Contact email: apply@example.com')).toBeTruthy()
  })

  it.each([
    ['pending', 'Pending review'],
    ['approved', 'Approved'],
    ['rejected', 'Rejected'],
  ] as const)('shows %s status', function run(status, label) {
    render(<ApplicationStatusDumb application={build({ status })} />)
    expect(screen.getByTestId('application-status').textContent).toBe(label)
  })

  it('labels the section by its heading and shows no per-record verified badge', function run() {
    render(<ApplicationStatusDumb application={build({ status: 'approved' })} />)
    expect(
      screen.getByRole('region', { name: /Application status/ }),
    ).toBeTruthy()
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    for (const item of items) {
      expect(item.textContent).not.toMatch(/verified/i)
    }
  })
})
