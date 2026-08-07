import type { EmploymentRecordCompatibilityResponse } from '@mako/shared'

export type CompanyListDumbProps = {
  companies: EmploymentRecordCompatibilityResponse[]
  isLoading: boolean
  isError: boolean
  errorMessage: string | null
  isAddModalOpen: boolean
  isEditModalOpen: boolean
  companyName: string
  role: string
  startDate: string
  endDate: string
  isCurrentRole: boolean
  isSubmitting: boolean
  isDeleting: boolean
  submitErrorMessage: string | null
  deleteErrorMessage: string | null
  deleteTarget: EmploymentRecordCompatibilityResponse | null
  onCompanyNameChange: (nextCompanyName: string) => void
  onRoleChange: (nextRole: string) => void
  onStartDateChange: (nextStartDate: string) => void
  onEndDateChange: (nextEndDate: string) => void
  onCurrentRoleChange: (nextIsCurrentRole: boolean) => void
  onOpenAddModal: () => void
  onCloseAddModal: () => void
  onOpenEditModal: (company: EmploymentRecordCompatibilityResponse) => void
  onCloseEditModal: () => void
  onSubmitAddCompany: () => void
  onSubmitEditCompany: () => void
  onRequestDelete: (company: EmploymentRecordCompatibilityResponse) => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}
