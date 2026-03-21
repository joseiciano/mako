import { useState } from 'react'
import { useAddCompany, useCompanies } from '#/hooks/use-account'
import { CompanyListDumb } from './company-list-dumb'

export function CompanyList() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [joinedDate, setJoinedDate] = useState('')

  const companiesQuery = useCompanies()
  const addCompanyMutation = useAddCompany()

  function openModal() {
    setIsAddModalOpen(true)
  }

  function closeModal() {
    setIsAddModalOpen(false)
    setCompanyName('')
    setJoinedDate('')
    addCompanyMutation.reset()
  }

  function submitCompany() {
    addCompanyMutation.mutate(
      {
        company: companyName,
        joined: joinedDate,
      },
      {
        onSuccess: function onSuccess() {
          closeModal()
        },
      },
    )
  }

  return (
    <CompanyListDumb
      companies={companiesQuery.data ?? []}
      companyName={companyName}
      errorMessage={companiesQuery.error?.message ?? null}
      isAddModalOpen={isAddModalOpen}
      isError={companiesQuery.isError}
      isLoading={companiesQuery.isLoading}
      isSubmitting={addCompanyMutation.isPending}
      joinedDate={joinedDate}
      onCloseAddModal={closeModal}
      onCompanyNameChange={setCompanyName}
      onJoinedDateChange={setJoinedDate}
      onOpenAddModal={openModal}
      onSubmitAddCompany={submitCompany}
      submitErrorMessage={addCompanyMutation.error?.message ?? null}
    />
  )
}
