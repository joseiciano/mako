import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DeleteAccountConfirmationDumb } from './delete-account-confirmation-dumb'

describe(
  'DeleteAccountConfirmationDumb',
  function deleteAccountConfirmationDumbSuite() {
    it('disables submit until confirmation text is valid', function testDisabledSubmit() {
      render(
        <DeleteAccountConfirmationDumb
          isOpen
          confirmationInput=""
          canSubmit={false}
          isDeleting={false}
          onClose={vi.fn()}
          onConfirm={vi.fn(async function onConfirm() {})}
          onConfirmationInputChange={vi.fn()}
        />,
      )

      expect(
        screen.getByRole('button', { name: 'Delete account permanently' }),
      ).toBeDisabled()
    })

    it('emits confirmation input changes', function testInputChange() {
      const onConfirmationInputChange = vi.fn()

      render(
        <DeleteAccountConfirmationDumb
          isOpen
          confirmationInput=""
          canSubmit={false}
          isDeleting={false}
          onClose={vi.fn()}
          onConfirm={vi.fn(async function onConfirm() {})}
          onConfirmationInputChange={onConfirmationInputChange}
        />,
      )

      fireEvent.change(screen.getByLabelText('Confirmation text'), {
        target: {
          value: 'DELETE',
        },
      })

      expect(onConfirmationInputChange).toHaveBeenCalledWith('DELETE')
    })
  },
)
