import { useState } from 'react'
import {
  DeleteAccountConfirmation,
} from '../../modals/delete-account-confirmation'
import { DangerZoneDumb } from './danger-zone-dumb'

export function DangerZone() {
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)

  return (
    <>
      <DangerZoneDumb
        onDeleteAccount={function handleDeleteButtonClick() {
          setIsDeleteModalOpen(true)
        }}
      />
      <DeleteAccountConfirmation
        isOpen={isDeleteModalOpen}
        onClose={function closeDeleteModal() {
          setIsDeleteModalOpen(false)
        }}
      />
    </>
  )
}
