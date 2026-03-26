import type { Company } from '#/hooks/use-account'

export type CompanyListDumbProps = {
  companies: Company[]
  isLoading: boolean
  isError: boolean
  errorMessage: string | null
  isAddModalOpen: boolean
  companyName: string
  joinedDate: string
  isSubmitting: boolean
  submitErrorMessage: string | null
  onCompanyNameChange: (nextCompanyName: string) => void
  onJoinedDateChange: (nextJoinedDate: string) => void
  onOpenAddModal: () => void
  onCloseAddModal: () => void
  onSubmitAddCompany: () => void
}
