import { useRouter } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useDeleteAccount } from '../../../hooks/use-account'
import { DeleteAccountConfirmationDumb } from './delete-account-confirmation-dumb'

const ACCOUNT_DELETION_CONFIRMATION = 'DELETE'

export type DeleteAccountConfirmationProps = {
  isOpen: boolean
  onClose: () => void
}

export function DeleteAccountConfirmation(
  props: DeleteAccountConfirmationProps,
) {
  const [confirmationInput, setConfirmationInput] = useState('')
  const deleteAccountMutation = useDeleteAccount()
  const router = useRouter()

  useEffect(
    function resetConfirmationWhenModalIsClosed() {
      if (!props.isOpen) {
        setConfirmationInput('')
      }
    },
    [props.isOpen],
  )

  const canSubmit = useMemo(
    function createCanSubmitState() {
      return confirmationInput === ACCOUNT_DELETION_CONFIRMATION
    },
    [confirmationInput],
  )

  async function handleConfirm(): Promise<void> {
    if (!canSubmit || deleteAccountMutation.isPending) {
      return
    }

    try {
      await deleteAccountMutation.mutateAsync()
    } catch {
      return
    }
    props.onClose()
    await router.navigate({ to: '/' })
  }

  const errorMessage =
    deleteAccountMutation.error instanceof Error
      ? deleteAccountMutation.error.message
      : undefined

  return (
    <DeleteAccountConfirmationDumb
      isOpen={props.isOpen}
      confirmationInput={confirmationInput}
      isDeleting={deleteAccountMutation.isPending}
      canSubmit={canSubmit}
      errorMessage={errorMessage}
      onClose={props.onClose}
      onConfirm={handleConfirm}
      onConfirmationInputChange={setConfirmationInput}
    />
  )
}
