import { useEffect, useState, type FormEvent } from 'react'
import {
  useAccount,
  useUpdateProfile,
  updateAccountProfile,
} from '#/hooks/use-account'
import { ProfileDumb } from './profile-dumb'

type ProfileFormPayload = Parameters<typeof updateAccountProfile>[0]

export function ProfileSmart() {
  const accountQuery = useAccount()
  const updateProfileMutation = useUpdateProfile()
  const [displayName, setDisplayName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(
    function syncDisplayNameFromQuery() {
      if (accountQuery.data) {
        setDisplayName(accountQuery.data.displayName)
      }
    },
    [accountQuery.data],
  )

  function handleDisplayNameChange(nextValue: string): void {
    setDisplayName(nextValue)
    setFormError(null)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const payload: ProfileFormPayload = {
      displayName,
    }

    updateProfileMutation.mutate(payload, {
      onError: function onError(error) {
        setFormError(error.message)
      },
    })
  }

  return (
    <ProfileDumb
      account={accountQuery.data ?? null}
      displayName={displayName}
      isLoading={accountQuery.isLoading}
      isRefreshing={accountQuery.isFetching}
      isSaving={updateProfileMutation.isPending}
      errorMessage={resolveErrorMessage(accountQuery.error, formError)}
      onRetry={function onRetry() {
        accountQuery.refetch()
      }}
      onDisplayNameChange={handleDisplayNameChange}
      onSubmit={handleSubmit}
    />
  )
}

function resolveErrorMessage(
  queryError: Error | null,
  formError: string | null,
): string | null {
  if (formError) {
    return formError
  }

  if (queryError) {
    return queryError.message
  }

  return null
}
