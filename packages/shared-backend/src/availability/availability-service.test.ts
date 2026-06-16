import { describe, expect, it } from 'vitest'
import {
  AvailabilityRepository,
  createInMemoryAvailabilityDataSource,
  type CreateAvailabilityRecordInput,
  type CreateAvailabilityRecordResult,
} from './availability-repository'
import { AvailabilityService } from './availability-service'
import {
  AvailabilityBusinessRuleError,
  AvailabilityUnauthorizedError,
  type AvailabilitySession,
} from './types'

const activeSession: AvailabilitySession = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'candidate@mako.dev',
}

describe('AvailabilityService', function availabilityServiceSuite() {
  it('rejects unauthenticated session', async function run() {
    const { service } = createAvailabilityService()

    await expect(
      service.createAvailability(null, {
        interview_type: 'system_design',
        max_matches: 2,
        slots: [
          {
            start_time: '2026-04-13T10:00:00.000Z',
            end_time: '2026-04-13T11:00:00.000Z',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(AvailabilityUnauthorizedError)
  })

  it('rejects invalid session userId with unauthorized error', async function run() {
    const { service } = createAvailabilityService()
    const invalidSession: AvailabilitySession = {
      userId: 'not-a-valid-uuid',
      email: 'candidate@mako.dev',
    }

    await expect(
      service.createAvailability(invalidSession, {
        interview_type: 'system_design',
        max_matches: 2,
        slots: [
          {
            start_time: '2026-04-13T10:00:00.000Z',
            end_time: '2026-04-13T11:00:00.000Z',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(AvailabilityUnauthorizedError)
  })

  it('creates availability with deterministic server fields', async function run() {
    const { service } = createAvailabilityService()

    const response = await service.createAvailability(activeSession, {
      interview_type: 'system_design',
      max_matches: 2,
      slots: [
        {
          start_time: '2026-04-13T10:00:00.000Z',
          end_time: '2026-04-13T11:00:00.000Z',
        },
      ],
    })

    expect(response.request).toMatchObject({
      id: '00000000-0000-4000-8000-000000000000',
      user_id: activeSession.userId,
      interview_type: 'system_design',
      max_matches: 2,
      current_matches: 0,
      status: 'active',
      created_at: '2026-04-13T09:00:00.000Z',
      updated_at: '2026-04-13T09:00:00.000Z',
    })

    expect(response.slots).toHaveLength(1)
    expect(response.slots[0]).toMatchObject({
      id: '00000000-0000-4000-8000-000000000001',
      request_id: '00000000-0000-4000-8000-000000000000',
      start_time: '2026-04-13T10:00:00.000Z',
      end_time: '2026-04-13T11:00:00.000Z',
      status: 'available',
      created_at: '2026-04-13T09:00:00.000Z',
      updated_at: '2026-04-13T09:00:00.000Z',
    })
  })

  it('orders slots chronologically by start_time', async function run() {
    const { service } = createAvailabilityService()

    const response = await service.createAvailability(activeSession, {
      interview_type: 'coding',
      max_matches: 3,
      slots: [
        {
          start_time: '2026-04-13T12:00:00.000Z',
          end_time: '2026-04-13T13:00:00.000Z',
        },
        {
          start_time: '2026-04-13T10:00:00.000Z',
          end_time: '2026-04-13T11:00:00.000Z',
        },
        {
          start_time: '2026-04-13T11:00:00.000Z',
          end_time: '2026-04-13T12:00:00.000Z',
        },
      ],
    })

    expect(response.slots).toHaveLength(3)
    expect(response.slots.map((s) => s.start_time)).toEqual([
      '2026-04-13T10:00:00.000Z',
      '2026-04-13T11:00:00.000Z',
      '2026-04-13T12:00:00.000Z',
    ])
  })

  it('does not mutate repository returned slots while ordering response', async function run() {
    let seq = 0
    let repositoryReturnedSlots: CreateAvailabilityRecordResult['slots'] = []
    const service = new AvailabilityService(
      new AvailabilityRepository({
        async createAvailability(
          input: CreateAvailabilityRecordInput,
        ): Promise<CreateAvailabilityRecordResult> {
          const response = {
            request: input.request,
            slots: input.slots.map((slot) => ({ ...slot })),
          }
          repositoryReturnedSlots = response.slots

          return response
        },
      }),
      function createId() {
        return `00000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`
      },
      function now() {
        return '2026-04-13T09:00:00.000Z'
      },
    )

    const response = await service.createAvailability(activeSession, {
      interview_type: 'coding',
      max_matches: 3,
      slots: [
        {
          start_time: '2026-04-13T12:00:00.000Z',
          end_time: '2026-04-13T13:00:00.000Z',
        },
        {
          start_time: '2026-04-13T10:00:00.000Z',
          end_time: '2026-04-13T11:00:00.000Z',
        },
        {
          start_time: '2026-04-13T11:00:00.000Z',
          end_time: '2026-04-13T12:00:00.000Z',
        },
      ],
    })

    expect(response.slots.map((slot) => slot.start_time)).toEqual([
      '2026-04-13T10:00:00.000Z',
      '2026-04-13T11:00:00.000Z',
      '2026-04-13T12:00:00.000Z',
    ])
    const unsortedRepositorySlots = repositoryReturnedSlots

    expect(unsortedRepositorySlots.map((slot) => slot.start_time)).toEqual([
      '2026-04-13T12:00:00.000Z',
      '2026-04-13T10:00:00.000Z',
      '2026-04-13T11:00:00.000Z',
    ])
  })

  it('rejects duplicate slot windows in same request', async function run() {
    const { service } = createAvailabilityService()

    await expect(
      service.createAvailability(activeSession, {
        interview_type: 'behavioral',
        max_matches: 1,
        slots: [
          {
            start_time: '2026-04-13T10:00:00.000Z',
            end_time: '2026-04-13T11:00:00.000Z',
          },
          {
            start_time: '2026-04-13T10:00:00.000Z',
            end_time: '2026-04-13T11:00:00.000Z',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(AvailabilityBusinessRuleError)
  })

  it('rejects offset-equivalent duplicate slot windows', async function run() {
    const { service } = createAvailabilityService()

    await expect(
      service.createAvailability(activeSession, {
        interview_type: 'behavioral',
        max_matches: 1,
        slots: [
          {
            start_time: '2026-04-13T10:00:00.000Z',
            end_time: '2026-04-13T11:00:00.000Z',
          },
          {
            start_time: '2026-04-13T10:00:00.000+00:00',
            end_time: '2026-04-13T11:00:00.000+00:00',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(AvailabilityBusinessRuleError)
  })
})

function createAvailabilityService() {
  let seq = 0
  const repository = new AvailabilityRepository(createInMemoryAvailabilityDataSource())
  const service = new AvailabilityService(
    repository,
    function createId() {
      return `00000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`
    },
    function now() {
      return '2026-04-13T09:00:00.000Z'
    },
  )

  return {
    repository,
    service,
  }
}
