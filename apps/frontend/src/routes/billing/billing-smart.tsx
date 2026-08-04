import { useState } from 'react'
import { useAccount } from '#/hooks/use-account'
import {
  useCreatePaymentIntent,
  useCreditPackages,
} from '#/hooks/use-payments'
import { BillingDumb } from './billing-dumb'

export function BillingSmart() {
  const accountQuery = useAccount()
  const packagesQuery = useCreditPackages()
  const createIntent = useCreatePaymentIntent()
  const [selectedPackageId, setSelectedPackageId] = useState<string | undefined>()
  const [clientSecret, setClientSecret] = useState<string | undefined>()

  if (accountQuery.isPending) {
    return <BillingDumb state="loading" />
  }

  if (accountQuery.isError) {
    return (
      <BillingDumb
        state="error"
        errorMessage={accountQuery.error.message}
        onRetry={accountQuery.refetch}
        isRetrying={accountQuery.isFetching}
      />
    )
  }

  const account = accountQuery.data

  if (!account) {
    return <BillingDumb state="error" errorMessage="Unable to load billing balances." />
  }

  function handleSelectPackage(packageId: string) {
    setSelectedPackageId(packageId)
    // A stored secret only corresponds to the previously selected package.
    // Clear it so the checkout story can't consume a stale, mismatched intent.
    setClientSecret(undefined)
  }

  function handlePurchase() {
    if (!selectedPackageId || createIntent.isPending) {
      return
    }

    createIntent.mutate(
      { package_id: selectedPackageId },
      {
        onSuccess: function handleIntentSuccess(result) {
          setClientSecret(result.client_secret)
        },
        onError: function handleIntentError() {
          // Keep the selected package so the user can retry; surface the error.
        },
      },
    )
  }

  return (
    <BillingDumb
      state="populated"
      account={account}
      packages={packagesQuery.data?.packages}
      packagesLoading={packagesQuery.isPending}
      packagesError={
        packagesQuery.isError ? packagesQuery.error.message : undefined
      }
      isRetryingPackages={packagesQuery.isFetching}
      onRetryPackages={packagesQuery.refetch}
      selectedPackageId={selectedPackageId}
      onSelectPackage={handleSelectPackage}
      isPurchasing={createIntent.isPending}
      purchaseError={createIntent.isError ? createIntent.error.message : undefined}
      purchaseResult={clientSecret}
      onPurchase={handlePurchase}
    />
  )
}
