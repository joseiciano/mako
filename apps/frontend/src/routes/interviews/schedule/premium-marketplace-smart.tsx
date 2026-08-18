import { useCallback, useEffect, useRef, useState } from 'react'
import type { PremiumClaimResponse } from '@mako/shared'

/** Module-level guard survives React Strict Mode remounts. */
export const replayedClaims = new Set<string>()
import {
  sortMarketplaceSlots,
  useClaimPremiumSlot,
  usePremiumMarketplace,
} from '#/hooks/use-premium-marketplace'
import { useAccount } from '#/hooks/use-account'
import {
  clearVerifiedInterviewerClaim,
  persistVerifiedInterviewerClaim,
  readScheduleDraftV2,
} from './schedule-draft-storage'
import {
  PremiumMarketplaceDumb,
  type PremiumMarketplaceErrorOutcome,
} from './premium-marketplace-dumb'

export const PREMIUM_SLOT_ALREADY_CLAIMED = 'PREMIUM_SLOT_ALREADY_CLAIMED'
export const PREMIUM_INTERVIEWER_INELIGIBLE = 'PREMIUM_INTERVIEWER_INELIGIBLE'
export const INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS'
export const PREMIUM_SCHEDULING_CONFLICT = 'PREMIUM_SCHEDULING_CONFLICT'
export const IDEMPOTENCY_KEY_CONFLICT = 'IDEMPOTENCY_KEY_CONFLICT'

export type ClaimFailureKind =
  | 'already_claimed'
  | 'interviewer_ineligible'
  | 'insufficient_credits'
  | 'scheduling_conflict'
  | 'idempotency_conflict'
  | 'transient'
  | 'persist_failed'

type DurableClaim = {
  slotId: string
  idempotencyKey: string
  startedAt: string
}

function replayKey(claim: DurableClaim): string {
  return `${claim.slotId}:${claim.idempotencyKey}`
}

export function classifyClaimError(error: Error | null): ClaimFailureKind | null {
  if (error === null) return null

  switch (error.message) {
    case PREMIUM_SLOT_ALREADY_CLAIMED:
      return 'already_claimed'
    case PREMIUM_INTERVIEWER_INELIGIBLE:
      return 'interviewer_ineligible'
    case INSUFFICIENT_CREDITS:
      return 'insufficient_credits'
    case PREMIUM_SCHEDULING_CONFLICT:
      return 'scheduling_conflict'
    case IDEMPOTENCY_KEY_CONFLICT:
      return 'idempotency_conflict'
    default:
      return 'transient'
  }
}

function buildOutcome(
  failure: ClaimFailureKind,
): PremiumMarketplaceErrorOutcome {
  switch (failure) {
    case 'already_claimed':
      return {
        message:
          'This slot is no longer available. It may have just been claimed by another candidate.',
        retryLabel: null,
        sameSlotResubmitLabel: null,
        billingHref: null,
      }
    case 'interviewer_ineligible':
      return {
        message:
          'The interviewer for this slot is no longer eligible. We refreshed the available slots.',
        retryLabel: null,
        sameSlotResubmitLabel: null,
        billingHref: null,
      }
    case 'insufficient_credits':
      return {
        message:
          'A claim costs exactly one credit and your balance is too low. Add credits to continue.',
        retryLabel: 'Retry claim',
        sameSlotResubmitLabel: null,
        billingHref: '/billing',
      }
    case 'scheduling_conflict':
      return {
        message:
          'This slot conflicts with an interview you already have scheduled.',
        retryLabel: 'Retry claim',
        sameSlotResubmitLabel: null,
        billingHref: null,
      }
    case 'idempotency_conflict':
      return {
        message:
          'Your previous claim could not be confirmed. Choose "Claim again with a fresh key" to retry this slot.',
        retryLabel: null,
        sameSlotResubmitLabel: 'Claim again with a fresh key',
        billingHref: null,
      }
    case 'transient':
      return {
        message:
          'We could not confirm whether your claim went through. Retrying is safe and will not double-charge you.',
        retryLabel: 'Retry claim',
        sameSlotResubmitLabel: null,
        billingHref: null,
      }
    case 'persist_failed':
      return {
        message:
          'We could not securely save your claim, so no request was sent. Try again.',
        retryLabel: null,
        sameSlotResubmitLabel: null,
        billingHref: null,
      }
  }
}

function readPersistedClaim(): DurableClaim | null {
  if (typeof window === 'undefined') return null

  const envelope = readScheduleDraftV2()
  if (envelope !== null && envelope.branch === 'verified_interviewer') {
    return {
      slotId: envelope.slotId,
      idempotencyKey: envelope.idempotencyKey,
      startedAt: envelope.startedAt,
    }
  }

  return null
}

export function PremiumMarketplaceSmart() {
  const marketplace = usePremiumMarketplace()
  const claimMutation = useClaimPremiumSlot()
  const account = useAccount()

  const [durableClaim, setDurableClaimState] = useState<DurableClaim | null>(
    readPersistedClaim,
  )
  const durableClaimRef = useRef<DurableClaim | null>(durableClaim)
  const [errorOutcome, setErrorOutcome] =
    useState<PremiumMarketplaceErrorOutcome | null>(null)
  const [bookedInterviewId, setBookedInterviewId] = useState<string | null>(
    null,
  )

  const setDurableClaim = useCallback(
    function setDurableClaim(claim: DurableClaim | null) {
      durableClaimRef.current = claim
      setDurableClaimState(claim)
    },
    [],
  )

  const handleClaimSuccess = useCallback(
    function handleClaimSuccess(data: PremiumClaimResponse, claim: DurableClaim) {
      replayedClaims.delete(replayKey(claim))
      clearVerifiedInterviewerClaim()
      setDurableClaim(null)
      setErrorOutcome(null)
      setBookedInterviewId(data.interview.id)
    },
    [setDurableClaim],
  )

  const handleClaimError = useCallback(
    function handleClaimError(error: Error, claim: DurableClaim) {
      const failure = classifyClaimError(error) ?? 'transient'

      if (failure === 'already_claimed' || failure === 'interviewer_ineligible') {
        replayedClaims.delete(replayKey(claim))
        clearVerifiedInterviewerClaim()
        setDurableClaim(null)
        void marketplace.refetch()
      }

      setErrorOutcome(buildOutcome(failure))
    },
    [setDurableClaim, marketplace],
  )

  const issueClaim = useCallback(
    function issueClaim(claim: DurableClaim) {
      claimMutation.mutate(
        { slotId: claim.slotId, idempotencyKey: claim.idempotencyKey },
        {
          onSuccess: function onClaimSuccess(data) {
            handleClaimSuccess(data, claim)
          },
          onError: function onClaimError(error) {
            handleClaimError(error, claim)
          },
        },
      )
    },
    [claimMutation, handleClaimSuccess, handleClaimError],
  )

  const issueClaimRef = useRef(issueClaim)
  issueClaimRef.current = issueClaim

  useEffect(function replayPersistedClaimOnMount() {
    const claim = durableClaimRef.current
    if (claim === null) return

    const key = `${claim.slotId}:${claim.idempotencyKey}`
    if (replayedClaims.has(key)) return
    replayedClaims.add(key)

    setBookedInterviewId(null)
    setErrorOutcome(null)
    issueClaimRef.current(claim)
  }, [])

  const handleBookSlot = useCallback(
    function handleBookSlot(slotId: string) {
      if (durableClaimRef.current !== null) return
      if (claimMutation.isPending) return

      const idempotencyKey = crypto.randomUUID()
      const startedAt = new Date().toISOString()
      const claim: DurableClaim = { slotId, idempotencyKey, startedAt }

      try {
        persistVerifiedInterviewerClaim(claim)
      } catch {
        setBookedInterviewId(null)
        setErrorOutcome(buildOutcome('persist_failed'))
        return
      }

      setDurableClaim(claim)
      setErrorOutcome(null)
      setBookedInterviewId(null)
      issueClaim(claim)
    },
    [claimMutation.isPending, setDurableClaim, issueClaim],
  )

  const handleRetry = useCallback(
    function handleRetry() {
      const claim = durableClaimRef.current
      if (claim === null) return
      if (claimMutation.isPending) return

      try {
        persistVerifiedInterviewerClaim(claim)
      } catch {
        setErrorOutcome(buildOutcome('persist_failed'))
        return
      }

      setErrorOutcome(null)
      issueClaim(claim)
    },
    [claimMutation.isPending, issueClaim],
  )

  const handleSameSlotResubmit = useCallback(
    function handleSameSlotResubmit() {
      const claim = durableClaimRef.current
      if (claim === null) return
      if (claimMutation.isPending) return

      replayedClaims.delete(replayKey(claim))

      const freshKey = crypto.randomUUID()
      const startedAt = new Date().toISOString()
      const replacement: DurableClaim = {
        slotId: claim.slotId,
        idempotencyKey: freshKey,
        startedAt,
      }

      try {
        persistVerifiedInterviewerClaim(replacement)
      } catch {
        setErrorOutcome(buildOutcome('persist_failed'))
        return
      }

      setDurableClaim(replacement)
      setErrorOutcome(null)
      issueClaim(replacement)
    },
    [claimMutation.isPending, setDurableClaim, issueClaim],
  )

  const handleRetryMarketplace = useCallback(
    function handleRetryMarketplace() {
      void marketplace.refetch()
    },
    [marketplace],
  )

  const slots =
    marketplace.isSuccess && marketplace.data
      ? sortMarketplaceSlots(
          marketplace.data.slots.filter(
            (slot) => slot.interviewType === 'system_design',
          ),
        )
      : []

  const priceCredits = marketplace.data?.policy.priceCredits ?? 1

  const accountCredits =
    account.isSuccess && account.data ? account.data.credits : null

  const isReserving = claimMutation.isPending

  const pendingClaimMessage =
    durableClaim !== null
      ? 'You have a claim in progress. Resolve it before claiming a different slot.'
      : null

  return (
    <PremiumMarketplaceDumb
      slots={slots}
      priceCredits={priceCredits}
      accountCredits={accountCredits}
      isLoading={marketplace.isLoading}
      isError={marketplace.isError}
      isReserving={isReserving}
      pendingClaimMessage={pendingClaimMessage}
      errorOutcome={errorOutcome}
      bookedInterviewId={bookedInterviewId}
      onBookSlot={handleBookSlot}
      onRetry={handleRetry}
      onSameSlotResubmit={handleSameSlotResubmit}
      onRetryMarketplace={handleRetryMarketplace}
    />
  )
}
