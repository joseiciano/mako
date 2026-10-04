import {
  defaultAdminListLimit,
  type AdminApplicationStatus,
  type AdminDecision,
} from '@mako/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import {
  adminApplicationDetailQueryKey,
  adminApplicationsListQueryRootKey,
  adminApplicationsQueryRootKey,
  useAdminApplicationDetail,
  useAdminApplications,
  useDecideAdminApplication,
} from '#/hooks/use-admin-reviews'
import { authSessionQueryKey } from '#/hooks/use-auth'
import { ApiError } from '#/lib/http-transport'
import { AdminReviewDetailDumb } from './admin-review-detail-dumb'
import { AdminReviewLayoutDumb } from './admin-review-layout-dumb'
import { AdminReviewListDumb } from './admin-review-list-dumb'

type SessionLoss = 'unauthenticated' | 'forbidden'

const SESSION_LOSS_MESSAGES: Record<SessionLoss, string> = {
  unauthenticated: 'Your session has expired. Redirecting to sign in...',
  forbidden: 'Admin access was revoked. Redirecting to your dashboard...',
}

const CONFLICT_MESSAGE =
  'This application was already decided or changed. The list has been refreshed; review it again before deciding.'

function getErrorStatus(error: unknown): number | undefined {
  return error instanceof ApiError ? error.status : undefined
}

function getErrorMessage(error: unknown): string | null {
  if (error == null) {
    return null
  }

  return error instanceof Error ? error.message : 'Something went wrong.'
}

export function AdminReview() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [status, setStatus] = useState<AdminApplicationStatus>('pending')
  const [offset, setOffset] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingDecision, setPendingDecision] = useState<AdminDecision | null>(null)
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)
  const [sessionLoss, setSessionLoss] = useState<SessionLoss | null>(null)
  const sessionLossRef = useRef<SessionLoss | null>(null)

  const listQuery = useAdminApplications({
    status,
    limit: defaultAdminListLimit,
    offset,
  })
  const detailQuery = useAdminApplicationDetail(selectedId)
  const decideMutation = useDecideAdminApplication()

  function handleAuthorizationFailure(errorStatus: number) {
    if (sessionLossRef.current !== null) {
      return
    }

    const loss: SessionLoss = errorStatus === 401 ? 'unauthenticated' : 'forbidden'
    sessionLossRef.current = loss
    setSessionLoss(loss)
    setSelectedId(null)
    setPendingDecision(null)

    // Drop every admin cache entry so a failed authorization is never reused.
    void queryClient.cancelQueries({ queryKey: adminApplicationsQueryRootKey })
    queryClient.removeQueries({ queryKey: adminApplicationsQueryRootKey })

    if (loss === 'unauthenticated') {
      queryClient.setQueryData(authSessionQueryKey, null)
      void navigate({ to: '/login', replace: true })
    } else {
      void queryClient.invalidateQueries({ queryKey: authSessionQueryKey })
      void navigate({ to: '/dashboard', replace: true })
    }
  }

  const listErrorStatus = getErrorStatus(listQuery.error)
  const detailErrorStatus = getErrorStatus(detailQuery.error)

  useEffect(
    function handleQueryAuthorizationLoss() {
      const failedStatus = [listErrorStatus, detailErrorStatus].find(
        function isAuthorizationStatus(value) {
          return value === 401 || value === 403
        },
      )

      if (failedStatus !== undefined) {
        handleAuthorizationFailure(failedStatus)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listErrorStatus, detailErrorStatus],
  )

  function resetSelection() {
    setSelectedId(null)
    setPendingDecision(null)
    setConflictMessage(null)
    decideMutation.reset()
  }

  function handleStatusChange(nextStatus: AdminApplicationStatus) {
    setStatus(nextStatus)
    setOffset(0)
    resetSelection()
  }

  function handlePreviousPage() {
    setOffset(Math.max(0, offset - defaultAdminListLimit))
    resetSelection()
  }

  function handleNextPage() {
    setOffset(offset + defaultAdminListLimit)
    resetSelection()
  }

  function handleSelect(applicationId: string) {
    setSelectedId(applicationId)
    setPendingDecision(null)
    setConflictMessage(null)
    decideMutation.reset()
  }

  function handleRequestDecision(decision: AdminDecision) {
    setConflictMessage(null)
    setPendingDecision(decision)
  }

  function handleConfirmDecision() {
    if (selectedId === null || pendingDecision === null || decideMutation.isPending) {
      return
    }

    const applicationId = selectedId

    decideMutation.mutate(
      { applicationId, decision: pendingDecision },
      {
        onSuccess: function onDecisionSuccess(application) {
          // A session lost mid-flight must not write the response into the cache.
          if (sessionLossRef.current !== null) {
            return
          }

          queryClient.setQueryData(adminApplicationDetailQueryKey(applicationId), application)
          void queryClient.invalidateQueries({ queryKey: adminApplicationsListQueryRootKey })
          setSelectedId(null)
          setPendingDecision(null)
        },
        onError: function onDecisionError(error) {
          const errorStatus = getErrorStatus(error)

          if (errorStatus === 401 || errorStatus === 403) {
            handleAuthorizationFailure(errorStatus)
            return
          }

          if (errorStatus === 409) {
            setConflictMessage(CONFLICT_MESSAGE)
            setPendingDecision(null)
            void queryClient.invalidateQueries({ queryKey: adminApplicationsListQueryRootKey })
            void queryClient.invalidateQueries({
              queryKey: adminApplicationDetailQueryKey(applicationId),
            })
          }
        },
      },
    )
  }

  const mutationErrorStatus = getErrorStatus(decideMutation.error)
  const submitErrorMessage =
    mutationErrorStatus === 409 || mutationErrorStatus === 401 || mutationErrorStatus === 403
      ? null
      : getErrorMessage(decideMutation.error)

  return (
    <AdminReviewLayoutDumb
      sessionLostMessage={sessionLoss ? SESSION_LOSS_MESSAGES[sessionLoss] : null}
      conflictMessage={conflictMessage}
      list={
        <AdminReviewListDumb
          status={status}
          onStatusChange={handleStatusChange}
          applications={listQuery.data?.applications ?? []}
          isLoading={listQuery.isPending && sessionLoss === null}
          errorMessage={sessionLoss ? null : getErrorMessage(listQuery.error)}
          onRetry={function retryList() {
            void listQuery.refetch()
          }}
          selectedApplicationId={selectedId}
          onSelect={handleSelect}
          offset={offset}
          hasMore={listQuery.data?.pagination.hasMore ?? false}
          onPreviousPage={handlePreviousPage}
          onNextPage={handleNextPage}
        />
      }
      detail={
        <AdminReviewDetailDumb
          hasSelection={selectedId !== null}
          application={detailQuery.data ?? null}
          isLoading={selectedId !== null && detailQuery.isPending}
          errorMessage={sessionLoss ? null : getErrorMessage(detailQuery.error)}
          onRetry={function retryDetail() {
            void detailQuery.refetch()
          }}
          pendingDecision={pendingDecision}
          isSubmitting={decideMutation.isPending}
          submitErrorMessage={submitErrorMessage}
          onRequestDecision={handleRequestDecision}
          onCancelDecision={function cancelDecision() {
            setPendingDecision(null)
          }}
          onConfirmDecision={handleConfirmDecision}
        />
      }
    />
  )
}

export const AdminReviewSmart = AdminReview
