import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  aiChatRequestSchema,
  aiChatResponseSchema,
} from './interviews'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(currentDirectory, '../../../')

function readRepositoryFile(...filePathSegments: string[]): string {
  return readFileSync(resolve(repositoryRoot, ...filePathSegments), 'utf8')
}

const storyDocument = readRepositoryFile(
  'docs',
  'product',
  'stories',
  'stories',
  'milestone-4-ai-interviewer-implementation',
  '4-5-ai-chat-reliability-security-and-observability.md',
)

describe('story 4.5 AI chat reliability, security, and observability', function () {
  it('keeps Story 4.5 marked completed with no unchecked items and required references', function () {
    const requiredReferences = [
      'docs/system/system-design/api-routes.md',
      'docs/infrastructure/backend.md',
      'docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-3-ai-gateway-prompt-and-canvas-guidance-integration.md',
      'docs/product/stories/stories/milestone-4-ai-interviewer-implementation/4-4-frontend-ai-led-session-chat-panel.md',
    ]

    for (const requiredReference of requiredReferences) {
      expect(storyDocument).toContain(requiredReference)
    }

    expect(storyDocument).toContain('**Status**: Completed')
    expect(storyDocument).not.toMatch(/- \[ \]/)
  })

  it('locks sensitive-data guardrails for the AI chat path', function () {
    expect(storyDocument).toContain('excalidraw_key')
    expect(storyDocument).toContain('do not leak sensitive values')
    expect(storyDocument).toContain('Keep AI chat observability aligned')
  })

  it('locks the cross-layer ai-chat contract: guidance_mode literal and stable prompt_version', function () {
    // The request and response schemas both pin guidance_mode to the single
    // 'review' literal so the frontend submit path, shared schemas, and backend
    // route responses stay aligned; any other value is rejected.
    expect(
      aiChatRequestSchema.safeParse({
        message: 'hi',
        canvas_snapshot: { type: 'excalidraw_scene', scene: {} },
        guidance_mode: 'brainstorm',
      }).success,
    ).toBe(false)
    expect(
      aiChatResponseSchema.safeParse({
        reply: 'hi',
        guidance_mode: 'brainstorm',
        prompt_version: 'v1',
      }).success,
    ).toBe(false)

    // prompt_version must be present and non-empty on every successful response.
    expect(aiChatResponseSchema.parse({
      reply: 'reply',
      guidance_mode: 'review',
      prompt_version: 'ai-whiteboard-v1',
    }).prompt_version).toBe('ai-whiteboard-v1')
  })

  it('keeps frontend submit and backend route on the same shared schemas', function () {
    // The frontend hook validates with the same shared request/response schemas
    // that the backend route enforces, so a change to one surface is caught here.
    const frontendHook = readRepositoryFile(
      'apps',
      'frontend',
      'src',
      'hooks',
      'use-interviews.ts',
    )
    expect(frontendHook).toContain("aiChatRequestSchema.parse")
    expect(frontendHook).toContain("aiChatResponseSchema.parse")

    const backendController = readRepositoryFile(
      'packages',
      'shared-backend',
      'src',
      'interviews',
      'interview-controller.ts',
    )
    expect(backendController).toContain("aiChatRequestSchema.parse")
    expect(backendController).toContain("aiChatResponseSchema.parse")
  })

  it('documents the ai-chat route prompt_version and error semantics', function () {
    const apiRoutes = readRepositoryFile(
      'docs',
      'system',
      'system-design',
      'api-routes.md',
    )

    expect(apiRoutes).toContain('prompt_version')
    expect(apiRoutes).toContain('502 Bad Gateway')
    expect(apiRoutes).toContain('503 Service Unavailable')
    expect(storyDocument).toContain('provider failure')
    expect(storyDocument).toContain('malformed upstream response')
    expect(storyDocument).toContain('stable route error mapping')
  })
})
