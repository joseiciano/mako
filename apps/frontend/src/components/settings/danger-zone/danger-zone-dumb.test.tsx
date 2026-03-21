import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DangerZoneDumb } from './danger-zone-dumb'

describe('DangerZoneDumb', function dangerZoneDumbSuite() {
  it('renders warning text and delete button', function testRender() {
    render(<DangerZoneDumb onDeleteAccount={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Danger Zone' })).toBeInTheDocument()
    expect(screen.getByText(/deleting your account is permanent/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'Delete Account',
      }),
    ).toBeInTheDocument()
  })

  it('calls onDeleteAccount when clicked', function testDeleteButtonClick() {
    const onDeleteAccount = vi.fn()
    render(<DangerZoneDumb onDeleteAccount={onDeleteAccount} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }))
    expect(onDeleteAccount).toHaveBeenCalledOnce()
  })
})
