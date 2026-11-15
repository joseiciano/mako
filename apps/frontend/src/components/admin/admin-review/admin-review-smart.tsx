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
  getAdminErrorMessage,
  getAdminErrorStatus,
  useAdminApplicationDetail,
  useAdminApplications,
  useDecideAdminApplication,
} from '#/hooks/use-admin-reviews'
import { authSessionQueryKey, authSessionQueryOptions, useAuth } from '#/hooks/use-auth'
import { AdminReviewDetailDumb } from './admin-review-detail-dumb'
import { AdminReviewLayoutDumb } from './admin-review-layout-dumb'
import { AdminReviewListDumb } from './admin-review-list-dumb'

type SessionLoss = 'unauthenticated' | 'forbidden'

const SESSION_LOSS_MESSAGES: Record<SessionLoss, string> = {
  unauthenticated: 'Your session has expired. Redirecting to sign in...',
  forbidden: 'Admin access was revoked. Redirecting to your dashboard...',
}

const STALE_DECISION_MESSAGES: Record<number, string> = {
  404: 'This application no longer exists. The list has been refreshed.',
  409: 'This application was already decided or changed. The list has been refreshed; review it again before deciding.',
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
  const { user } = useAuth()
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

  const isDecisionPending = decideMutation.isPending

  // After a decision the last page can become empty; step back instead of showing a dead page.
  const hasEmptyPage =
    listQuery.data !== undefined && listQuery.data.applications.length === 0 && !listQuery.isFetching

  useEffect(
    function stepBackFromEmptyPage() {
      if (hasEmptyPage && offset > 0) {
        setOffset(Math.max(0, offset - defaultAdminListLimit))
      }
    },
    [hasEmptyPage, offset],
  )

  const listErrorStatus = getAdminErrorStatus(listQuery.error)
  const detailErrorStatus = getAdminErrorStatus(detailQuery.error)

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

  // A 403 is either revoked admin access or a business rule (such as reviewing
  // your own application). The live session tells the two apart.
  async function verifyAdminAfterForbidden() {
    try {
      const session = await queryClient.fetchQuery({ ...authSessionQueryOptions(), staleTime: 0 })

      if (session?.session == null) {
        handleAuthorizationFailure(401)
      } else if (session.user?.isAdmin !== true) {
        handleAuthorizationFailure(403)
      }
    } catch {
      // The session could not be checked; the inline error stays visible.
    }
  }

  function resetSelection() {
    setSelectedId(null)
    setPendingDecision(null)
    setConflictMessage(null)
    decideMutation.reset()
  }

  function handleStatusChange(nextStatus: AdminApplicationStatus) {
    if (decideMutation.isPending) {
      return
    }

    setStatus(nextStatus)
    setOffset(0)
    resetSelection()
  }

  function handlePreviousPage() {
    if (decideMutation.isPending) {
      return
    }

    setOffset(Math.max(0, offset - defaultAdminListLimit))
    resetSelection()
  }

  function handleNextPage() {
    if (decideMutation.isPending) {
      return
    }

    setOffset(offset + defaultAdminListLimit)
    resetSelection()
  }

  function handleSelect(applicationId: string) {
    if (decideMutation.isPending) {
      return
    }

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
          const errorStatus = getAdminErrorStatus(error)

          if (errorStatus === 401) {
            handleAuthorizationFailure(401)
            return
          }

          if (errorStatus === 403) {
            void verifyAdminAfterForbidden()
            return
          }

          if (errorStatus === 409 || errorStatus === 404) {
            setConflictMessage(STALE_DECISION_MESSAGES[errorStatus])
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

  const mutationErrorStatus = getAdminErrorStatus(decideMutation.error)
  const submitErrorMessage =
    mutationErrorStatus === 409 || mutationErrorStatus === 404 || mutationErrorStatus === 401
      ? null
      : getAdminErrorMessage(decideMutation.error)

  return (
    <AdminReviewLayoutDumb
      sessionLostMessage={sessionLoss ? SESSION_LOSS_MESSAGES[sessionLoss] : null}
      conflictMessage={conflictMessage}
      list={
        <AdminReviewListDumb
          status={status}
          isDisabled={isDecisionPending}
          onStatusChange={handleStatusChange}
          applications={listQuery.data?.applications ?? []}
          isLoading={listQuery.isPending && sessionLoss === null}
          errorMessage={sessionLoss ? null : getAdminErrorMessage(listQuery.error)}
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
          errorMessage={sessionLoss ? null : getAdminErrorMessage(detailQuery.error)}
          onRetry={function retryDetail() {
            void detailQuery.refetch()
          }}
          currentUserId={user?.id ?? null}
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
