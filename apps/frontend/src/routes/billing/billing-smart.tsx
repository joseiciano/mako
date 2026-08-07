import { useState } from 'react'
import type { CreditPackage } from '@mako/shared'
import { useAccount } from '#/hooks/use-account'
import {
  useCreatePaymentIntent,
  useCreditPackages,
} from '#/hooks/use-payments'
import { useTransactionHistory } from '#/hooks/use-transaction-history'
import { formatCentsToUsd } from '#/lib/format-currency'
import { BillingCheckout } from './billing-checkout-smart'
import { BillingDumb } from './billing-dumb'

// Persists the active purchase across full-page navigations (e.g. a 3DS
// redirect). sessionStorage survives the redirect within the same tab, so the
// checkout can restore state and show pending fulfillment on return.
const STORAGE_KEY = 'mako.billing.purchase'

type PurchaseDraft = {
  packageId: string
  clientSecret: string
}

export function BillingSmart() {
  const accountQuery = useAccount()
  const packagesQuery = useCreditPackages()
  const transactionsQuery = useTransactionHistory()
  const createIntent = useCreatePaymentIntent()
  // Read the persisted draft once, lazily, on mount. sessionStorage access +
  // JSON.parse happen here and nowhere else per render, so account/packages
  // query updates never re-read storage.
  const [draft] = useState<PurchaseDraft | undefined>(() => readPurchaseDraft())
  const [selectedPackageId, setSelectedPackageId] = useState<
    string | undefined
  >(() => draft?.packageId)
  const [clientSecret, setClientSecret] = useState<string | undefined>(
    () => draft?.clientSecret,
  )

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
    // Clear it so the checkout can't consume a stale, mismatched intent.
    setClientSecret(undefined)
    clearPurchaseDraft()
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
          savePurchaseDraft({
            packageId: selectedPackageId,
            clientSecret: result.client_secret,
          })
        },
        onError: function handleIntentError() {
          // Keep the selected package so the user can retry; surface the error.
        },
      },
    )
  }

  const selectedPackage = packagesQuery.data?.packages.find(
    function findSelected(pkg: CreditPackage) {
      return pkg.package_id === selectedPackageId
    },
  )

  function handleCheckoutCancel() {
    setClientSecret(undefined)
    clearPurchaseDraft()
  }

  function handleCheckoutConfirmed() {
    // Payment succeeded (fulfillment pending async). Drop the persisted draft
    // so a later remount never re-offers a spent intent. Keep the in-memory
    // client secret so the pending-fulfillment UI stays visible this session.
    clearPurchaseDraft()
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
      onPurchase={handlePurchase}
      transactions={transactionsQuery.data?.transactions}
      transactionsTotal={transactionsQuery.data?.total}
      transactionsLoading={transactionsQuery.isPending}
      transactionsError={
        transactionsQuery.isError ? transactionsQuery.error.message : undefined
      }
      isRetryingTransactions={transactionsQuery.isFetching}
      onRetryTransactions={transactionsQuery.refetch}
      renderCheckout={
        clientSecret && selectedPackage
          ? function renderCheckout() {
              return (
                <BillingCheckout
                  clientSecret={clientSecret}
                  packageName={selectedPackage.display_name}
                  packageAmountLabel={formatCentsToUsd(selectedPackage.amount_cents)}
                  onCancel={handleCheckoutCancel}
                  onConfirmed={handleCheckoutConfirmed}
                />
              )
            }
          : undefined
      }
    />
  )
}

function readPurchaseDraft(): PurchaseDraft | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return undefined
    }
    const parsed = JSON.parse(raw) as Partial<PurchaseDraft>
    if (
      typeof parsed.packageId === 'string' &&
      parsed.packageId.length > 0 &&
      typeof parsed.clientSecret === 'string' &&
      parsed.clientSecret.length > 0
    ) {
      return { packageId: parsed.packageId, clientSecret: parsed.clientSecret }
    }
    return undefined
  } catch {
    return undefined
  }
}

function savePurchaseDraft(draft: PurchaseDraft) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
  } catch {
    // sessionStorage can be unavailable (private mode / disabled). Non-fatal.
  }
}

function clearPurchaseDraft() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Non-fatal.
  }
}
