import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { InterviewerApplication } from '@mako/shared'
import { ApplicationStatusDumb } from './application-status-dumb'

const baseApplication: InterviewerApplication = {
  applicationId: '33333333-3333-4333-8333-333333333333',
  email: 'me@example.com',
  employmentHistory: [
    {
      sourceCompanyId: '11111111-1111-4111-8111-111111111111',
      company: 'acme',
      role: 'Engineer',
      start: '2020-01-01',
      end: null,
    },
    {
      sourceCompanyId: null,
      company: 'globex',
      role: 'Intern',
      start: '2018-05-01',
      end: '2019-08-31',
    },
  ],
  status: 'pending',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('ApplicationStatusDumb', function suite() {
  it('renders the snapshot with Present for a null end date', function run() {
    render(<ApplicationStatusDumb application={baseApplication} />)

    expect(screen.getByText('acme - Engineer')).toBeTruthy()
    expect(screen.getByText('2020-01-01 — Present')).toBeTruthy()
    expect(screen.getByText('2018-05-01 — 2019-08-31')).toBeTruthy()
    expect(screen.getByText('Contact email: me@example.com')).toBeTruthy()
  })

  it.each([
    ['pending', 'Pending review'],
    ['approved', 'Approved'],
    ['rejected', 'Not approved'],
  ] as const)('renders %s status', function run(status, label) {
    render(<ApplicationStatusDumb application={{ ...baseApplication, status }} />)

    expect(screen.getByTestId('application-status').textContent).toBe(label)
  })

  it('exposes accessible labels and no per-record verification badges', function run() {
    render(<ApplicationStatusDumb application={baseApplication} />)

    expect(screen.getByRole('list', { name: 'Submitted employment history' })).toBeTruthy()
    expect(screen.getByRole('region', { name: /Application status/ })).toBeTruthy()
    expect(screen.queryByText(/verified/i)).toBeNull()
  })
})
