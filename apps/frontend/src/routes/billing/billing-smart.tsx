import { useAccount } from '#/hooks/use-account'
import { BillingDumb } from './billing-dumb'

export function BillingSmart() {
  const accountQuery = useAccount()

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

  return <BillingDumb state="populated" account={account} />
}
