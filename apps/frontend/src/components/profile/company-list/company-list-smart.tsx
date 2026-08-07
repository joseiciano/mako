import { employmentRecordInputSchema, type EmploymentRecordCompatibilityResponse, type EmploymentRecordInput } from '@mako/shared'
import { useState } from 'react'
import {
  useAddCompany,
  useCompanies,
  useDeleteCompany,
  useUpdateCompany,
} from '#/hooks/use-account'
import { CompanyListDumb } from './company-list-dumb'
import { getEmploymentFieldErrors } from './validation'

export function CompanyList() {
  const companiesQuery = useCompanies()
  const addCompanyMutation = useAddCompany()
  const updateCompanyMutation = useUpdateCompany()
  const deleteCompanyMutation = useDeleteCompany()

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editTarget, setEditTarget] =
    useState<EmploymentRecordCompatibilityResponse | null>(null)

  const [companyName, setCompanyName] = useState('')
  const [role, setRole] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [isCurrentRole, setIsCurrentRole] = useState(true)

  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] =
    useState<EmploymentRecordCompatibilityResponse | null>(null)
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null)

  function clearForm() {
    setCompanyName('')
    setRole('')
    setStartDate('')
    setEndDate('')
    setIsCurrentRole(true)
  }

  function openAddModal() {
    clearForm()
    setSubmitErrorMessage(null)
    setIsAddModalOpen(true)
  }

  function closeAddModal() {
    setIsAddModalOpen(false)
    clearForm()
    setSubmitErrorMessage(null)
    addCompanyMutation.reset()
  }

  function openEditModal(company: EmploymentRecordCompatibilityResponse) {
    setEditTarget(company)
    setCompanyName(company.company)
    setRole(company.role ?? '')
    setStartDate(company.start)
    setEndDate(company.end ?? '')
    setIsCurrentRole(company.end === null)
    setSubmitErrorMessage(null)
    setIsEditModalOpen(true)
  }

  function closeEditModal() {
    setIsEditModalOpen(false)
    setEditTarget(null)
    clearForm()
    setSubmitErrorMessage(null)
    updateCompanyMutation.reset()
  }

  function handleCurrentRoleChange(nextIsCurrentRole: boolean) {
    setIsCurrentRole(nextIsCurrentRole)

    if (nextIsCurrentRole) {
      setEndDate('')
    }
  }

  function buildInput(): EmploymentRecordInput | null {
    const fieldErrors = getEmploymentFieldErrors({
      companyName,
      role,
      startDate,
      endDate,
    })
    const hasFieldErrors = Object.values(fieldErrors).some(
      function hasError(error) {
        return error !== null
      },
    )

    if (hasFieldErrors) {
      return null
    }

    const parsedInput = employmentRecordInputSchema.safeParse({
      company: companyName,
      role,
      start: startDate,
      end: isCurrentRole ? null : (endDate.trim() === '' ? null : endDate),
    })

    return parsedInput.success ? parsedInput.data : null
  }

  function submitAddCompany() {
    const input = buildInput()

    if (!input) {
      setSubmitErrorMessage('Please fix the highlighted fields before saving.')
      return
    }

    setSubmitErrorMessage(null)
    addCompanyMutation.mutate(input, {
      onSuccess: closeAddModal,
      onError: function onAddError(error) {
        setSubmitErrorMessage(error.message)
      },
    })
  }

  function submitEditCompany() {
    if (!editTarget) {
      return
    }

    const input = buildInput()

    if (!input) {
      setSubmitErrorMessage('Please fix the highlighted fields before saving.')
      return
    }

    setSubmitErrorMessage(null)
    updateCompanyMutation.mutate(
      { id: editTarget.id, ...input },
      {
        onSuccess: closeEditModal,
        onError: function onUpdateError(error) {
          setSubmitErrorMessage(error.message)
        },
      },
    )
  }

  function requestDelete(company: EmploymentRecordCompatibilityResponse) {
    setDeleteTarget(company)
    setDeleteErrorMessage(null)
  }

  function confirmDelete() {
    if (!deleteTarget) {
      return
    }

    deleteCompanyMutation.mutate(deleteTarget.id, {
      onSuccess: function onDeleteSuccess() {
        setDeleteTarget(null)
        setDeleteErrorMessage(null)
      },
      onError: function onDeleteError(error) {
        setDeleteErrorMessage(error.message)
      },
    })
  }

  function cancelDelete() {
    setDeleteTarget(null)
    setDeleteErrorMessage(null)
  }

  return (
    <CompanyListDumb
      companies={companiesQuery.data ?? []}
      companyName={companyName}
      deleteErrorMessage={deleteErrorMessage}
      deleteTarget={deleteTarget}
      endDate={endDate}
      errorMessage={companiesQuery.error?.message ?? null}
      isAddModalOpen={isAddModalOpen}
      isCurrentRole={isCurrentRole}
      isDeleting={deleteCompanyMutation.isPending}
      isEditModalOpen={isEditModalOpen}
      isError={companiesQuery.isError}
      isLoading={companiesQuery.isLoading}
      isSubmitting={addCompanyMutation.isPending || updateCompanyMutation.isPending}
      onCancelDelete={cancelDelete}
      onCloseAddModal={closeAddModal}
      onCloseEditModal={closeEditModal}
      onCompanyNameChange={setCompanyName}
      onConfirmDelete={confirmDelete}
      onCurrentRoleChange={handleCurrentRoleChange}
      onEndDateChange={setEndDate}
      onOpenAddModal={openAddModal}
      onOpenEditModal={openEditModal}
      onRequestDelete={requestDelete}
      onRoleChange={setRole}
      onStartDateChange={setStartDate}
      onSubmitAddCompany={submitAddCompany}
      onSubmitEditCompany={submitEditCompany}
      role={role}
      startDate={startDate}
      submitErrorMessage={submitErrorMessage}
    />
  )
}
