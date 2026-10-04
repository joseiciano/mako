import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http-transport'
import { InterviewerApplicationSmart } from './interviewer-application-smart'

const idA = '11111111-1111-4111-8111-111111111111'
const idB = '22222222-2222-4222-8222-222222222222'
const idC = '44444444-4444-4444-8444-444444444444'

const useAccountMock = vi.hoisted(() => vi.fn())
const useCompaniesMock = vi.hoisted(() => vi.fn())
const useStatusMock = vi.hoisted(() => vi.fn())
const useSubmitMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', function mockRouter() {
  return {
    Link: function Link(props: { to: string; children: ReactNode }) {
      return <a href={props.to}>{props.children}</a>
    },
  }
})

vi.mock('../../../hooks/use-account', function mockUseAccount() {
  return { useAccount: useAccountMock, useCompanies: useCompaniesMock }
})

vi.mock('../../../hooks/use-interviewer-application', function mockHooks() {
  return {
    useInterviewerStatus: useStatusMock,
    useSubmitInterviewerApplication: useSubmitMock,
  }
})

function record(id: string, company: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: '99999999-9999-4999-8999-999999999999',
    company,
    role: 'Engineer',
    start: '2020-01-01',
    end: null,
    isComplete: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    joined: '2020-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function application(status: 'pending' | 'approved' | 'rejected') {
  return {
    applicationId: '33333333-3333-4333-8333-333333333333',
    email: 'old@example.com',
    employmentHistory: [
      { sourceCompanyId: idA, company: 'snapshotco', role: 'Staff', start: '2019-01-01', end: null },
    ],
    status,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

let mutateAsync: ReturnType<typeof vi.fn>
let refetchStatus: ReturnType<typeof vi.fn>

function setStatus(data: unknown, extra: Record<string, unknown> = {}) {
  useStatusMock.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    error: null,
    refetch: refetchStatus,
    ...extra,
  })
}

function setCompanies(data: unknown[] | undefined, extra: Record<string, unknown> = {}) {
  useCompaniesMock.mockReturnValue({
    data,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...extra,
  })
}

beforeEach(function reset() {
  mutateAsync = vi.fn().mockResolvedValue(application('pending'))
  refetchStatus = vi.fn().mockResolvedValue({ data: null })
  useAccountMock.mockReturnValue({ data: { email: 'me@example.com' } })
  useSubmitMock.mockReturnValue({ mutateAsync, isPending: false })
  setStatus(null)
  setCompanies([record(idA, 'acme'), record(idB, 'globex'), record(idC, 'initech')])
})

describe('InterviewerApplicationSmart', function suite() {
  it('shows the selection form when there is no application, with prefilled editable email', function run() {
    render(<InterviewerApplicationSmart />)

    const email = screen.getByLabelText('Contact email') as HTMLInputElement
    expect(email.value).toBe('me@example.com')
    fireEvent.change(email, { target: { value: 'other@example.com' } })
    expect(email.value).toBe('other@example.com')
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
  })

  it('shows a loading state and an error state with retry for status', function run() {
    setStatus(undefined, { isLoading: true })
    const first = render(<InterviewerApplicationSmart />)
    expect(screen.getByText('Loading application status...')).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
    first.unmount()

    setStatus(undefined, { isError: true, error: new Error('boom') })
    render(<InterviewerApplicationSmart />)
    expect(screen.getByRole('alert').textContent).toBe('boom')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetchStatus).toHaveBeenCalled()
  })

  it.each(['pending', 'approved'] as const)(
    'shows the snapshot and disables resubmission when %s',
    function run(status) {
      setStatus(application(status))
      render(<InterviewerApplicationSmart />)

      expect(screen.getByText('snapshotco - Staff')).toBeTruthy()
      expect(screen.queryByRole('button', { name: /Submit application/ })).toBeNull()
      expect(screen.queryByRole('checkbox')).toBeNull()
    },
  )

  it('re-enables submission for a rejected application', function run() {
    setStatus(application('rejected'))
    render(<InterviewerApplicationSmart />)

    expect(screen.getByText('snapshotco - Staff')).toBeTruthy()
    expect(screen.getByText('Reapply as a verified interviewer')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Submit application' })).toBeTruthy()
  })

  it('submits ids in profile order regardless of click order', async function run() {
    render(<InterviewerApplicationSmart />)

    const boxes = screen.getAllByRole('checkbox')
    fireEvent.click(boxes[2])
    fireEvent.click(boxes[0])
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))

    await waitFor(function called() {
      expect(mutateAsync).toHaveBeenCalledWith({
        email: 'me@example.com',
        employmentRecordIds: [idA, idC],
      })
    })
  })

  it('does not allow selecting incomplete records and links to settings', function run() {
    setCompanies([record(idA, 'acme'), record(idB, 'globex', { role: null, isComplete: false })])
    render(<InterviewerApplicationSmart />)

    expect((screen.getAllByRole('checkbox')[1] as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText('Needs details')).toBeTruthy()
  })

  it('shows an empty-history state', function run() {
    setCompanies([])
    render(<InterviewerApplicationSmart />)

    expect(screen.getByText('Add employment history in settings')).toBeTruthy()
  })

  it('requires at least one selection and focuses the error', async function run() {
    render(<InterviewerApplicationSmart />)

    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))

    const error = await screen.findByText('Select at least one employment record.')
    expect(mutateAsync).not.toHaveBeenCalled()
    await waitFor(function focused() {
      expect(document.activeElement).toBe(error)
    })
  })

  it('rejects more than 10 selections', async function run() {
    const ids = Array.from({ length: 11 }, function make(_, i) {
      return `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
    })
    setCompanies(ids.map(function toRecord(id, i) {
      return record(id, `company-${i}`)
    }))
    render(<InterviewerApplicationSmart />)

    screen.getAllByRole('checkbox').forEach(function select(box) {
      fireEvent.click(box)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))

    expect(await screen.findByText('Select no more than 10 employment records.')).toBeTruthy()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('validates the contact email and focuses it first', async function run() {
    render(<InterviewerApplicationSmart />)

    fireEvent.change(screen.getByLabelText('Contact email'), { target: { value: 'nope' } })
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))

    expect(await screen.findByText('Enter a valid contact email.')).toBeTruthy()
    await waitFor(function focused() {
      expect(document.activeElement).toBe(screen.getByLabelText('Contact email'))
    })
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('preserves selections and email after a retryable failure', async function run() {
    mutateAsync.mockRejectedValueOnce(new ApiError('Server unavailable', 503))
    render(<InterviewerApplicationSmart />)

    fireEvent.change(screen.getByLabelText('Contact email'), { target: { value: 'keep@example.com' } })
    fireEvent.click(screen.getAllByRole('checkbox')[1])
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))

    expect(await screen.findByText(/Server unavailable/)).toBeTruthy()
    expect((screen.getAllByRole('checkbox')[1] as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Contact email') as HTMLInputElement).value).toBe('keep@example.com')

    fireEvent.click(screen.getByRole('button', { name: 'Retry submission' }))
    await waitFor(function retried() {
      expect(mutateAsync).toHaveBeenCalledTimes(2)
    })
    expect(mutateAsync).toHaveBeenLastCalledWith({
      email: 'keep@example.com',
      employmentRecordIds: [idB],
    })
  })

  it('refetches status on 409 and converges without showing an error', async function run() {
    mutateAsync.mockRejectedValueOnce(new ApiError('Already applied', 409))
    refetchStatus.mockResolvedValue({ data: application('pending') })
    render(<InterviewerApplicationSmart />)

    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))

    await waitFor(function refetched() {
      expect(refetchStatus).toHaveBeenCalled()
    })
    expect(screen.queryByText(/Already applied/)).toBeNull()
  })

  it('shows the error when a 409 refetch yields no blocking application', async function run() {
    mutateAsync.mockRejectedValueOnce(new ApiError('Already applied', 409))
    refetchStatus.mockResolvedValue({ data: null })
    render(<InterviewerApplicationSmart />)

    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }))

    expect(await screen.findByText(/Already applied/)).toBeTruthy()
  })

  it('disables the form while the mutation is pending and keeps selections', function run() {
    useSubmitMock.mockReturnValue({ mutateAsync, isPending: true })
    render(<InterviewerApplicationSmart />)

    expect((screen.getByRole('button', { name: 'Submitting...' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    expect((screen.getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(false)
  })
})
