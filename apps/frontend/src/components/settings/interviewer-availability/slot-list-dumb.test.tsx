import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SlotListDumb } from './slot-list-dumb'
import type { PremiumInterviewerSlot } from '@mako/shared'

function buildSlot(overrides: Partial<PremiumInterviewerSlot> = {}): PremiumInterviewerSlot {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    interviewerId: '22222222-2222-4222-8222-222222222222',
    interviewType: 'system_design',
    startTime: '2026-08-08T10:00:00.000Z',
    endTime: '2026-08-08T11:00:00.000Z',
    status: 'available',
    createdAt: '2026-08-07T20:00:00.000Z',
    updatedAt: '2026-08-07T20:00:00.000Z',
    ...overrides,
  }
}

describe('SlotListDumb', function suite() {
  it('renders loading state', function run() {
    render(<SlotListDumb slots={[]} isLoading={true} cancelSlotId={null} cancelError={null} onCancel={vi.fn()} />)
    expect(screen.getByText('Loading...')).toBeTruthy()
  })

  it('renders empty inventory state', function run() {
    render(<SlotListDumb slots={[]} isLoading={false} cancelSlotId={null} cancelError={null} onCancel={vi.fn()} />)
    expect(screen.getByText(/No premium slots published yet/)).toBeTruthy()
  })

  it('renders available slot with cancel button', function run() {
    render(<SlotListDumb slots={[buildSlot()]} isLoading={false} cancelSlotId={null} cancelError={null} onCancel={vi.fn()} />)
    expect(screen.getByText('Available')).toBeTruthy()
    expect(screen.getByText('60 minutes · System Design')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Cancel slot/ })).toBeTruthy()
  })

  it('renders claimed slot without cancel button', function run() {
    render(<SlotListDumb slots={[buildSlot({ status: 'claimed' })]} isLoading={false} cancelSlotId={null} cancelError={null} onCancel={vi.fn()} />)
    expect(screen.getByText('Claimed')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Cancel slot/ })).toBeNull()
  })

  it('renders cancelled slot without cancel button', function run() {
    render(<SlotListDumb slots={[buildSlot({ status: 'cancelled' })]} isLoading={false} cancelSlotId={null} cancelError={null} onCancel={vi.fn()} />)
    expect(screen.getByText('Cancelled')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Cancel slot/ })).toBeNull()
  })

  it('disables cancel button when cancelSlotId matches', function run() {
    const slot = buildSlot()
    render(<SlotListDumb slots={[slot]} isLoading={false} cancelSlotId={slot.id} cancelError={null} onCancel={vi.fn()} />)
    const button = screen.getByRole('button', { name: /Cancel slot/ })
    expect(button).toHaveProperty('disabled', true)
    expect(button.textContent).toContain('Cancelling...')
  })

  it('calls onCancel with slot id when cancel clicked', async function run() {
    const onCancel = vi.fn()
    const slot = buildSlot()
    render(<SlotListDumb slots={[slot]} isLoading={false} cancelSlotId={null} cancelError={null} onCancel={onCancel} />)
    const button = screen.getByRole('button', { name: /Cancel slot/ })
    button.click()
    expect(onCancel).toHaveBeenCalledWith(slot.id)
  })

  it('conveys status to assistive technology via aria-label', function run() {
    render(<SlotListDumb slots={[buildSlot()]} isLoading={false} cancelSlotId={null} cancelError={null} onCancel={vi.fn()} />)
    expect(screen.getByLabelText('Status: Available')).toBeTruthy()
  })

  it('renders retryable error when owner-list query fails', function run() {
    const onRetry = vi.fn()
    render(
      <SlotListDumb
        slots={[]}
        isLoading={false}
        error="Unable to fetch premium slots."
        onRetry={onRetry}
        cancelSlotId={null}
        cancelError={null}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert').textContent).toContain('Unable to fetch premium slots.')
    const retryButton = screen.getByRole('button', { name: /Retry/i })
    expect(retryButton).toBeTruthy()
    retryButton.click()
    expect(onRetry).toHaveBeenCalled()
  })

  it('does not render empty inventory when error is present', function run() {
    render(
      <SlotListDumb
        slots={[]}
        isLoading={false}
        error="Network error"
        onRetry={vi.fn()}
        cancelSlotId={null}
        cancelError={null}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.queryByText(/No premium slots published yet/)).toBeNull()
  })
})
