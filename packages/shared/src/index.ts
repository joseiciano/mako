export type HealthResponse = {
  status: 'ok'
  service: string
  timestamp: string
}

export type AccountUser = {
  id: string
  email: string
  name: string | null
  credits: number
  free_standard_interviews: number
  free_ai_interviews: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type AccountResponse = {
  user: AccountUser
  free_standard_remaining: number
  free_ai_remaining: number
}

export type UpdateAccountRequest = {
  name: string
}

export type DeleteAccountResponse = {
  success: boolean
}

export function createHealthResponse(service: string): HealthResponse {
  return {
    status: 'ok',
    service,
    timestamp: new Date().toISOString(),
  }
}
