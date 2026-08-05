import { describe, expect, it } from 'vitest'
import {
  AI_CHAT_PROMPT_VERSION,
  buildAiChatMessages,
  buildSystemPrompt,
} from './ai-chat-prompt'
import type { AiChatPromptInput } from './ai-chat-prompt'

const BASE_INPUT: AiChatPromptInput = {
  message: 'Should I add a cache layer between these services?',
  interview_type: 'system_design',
  guidance_mode: 'review',
  canvas_snapshot: {
    type: 'excalidraw_scene',
    scene: {
      elements: [{ type: 'rectangle', label: 'user-queue' }],
    },
  },
}

describe('ai-chat-prompt', function aiChatPromptSuite() {
  it('publishes a version string that explicitly identifies system-design review', function version() {
    expect(AI_CHAT_PROMPT_VERSION).toBe('system-design-review-v1')
  })

  it('assembles messages in system -> history -> current message order for system_design', function order() {
    const messages = buildAiChatMessages({
      ...BASE_INPUT,
      chat_history: [
        { role: 'user', content: 'Here is my queue design.' },
        { role: 'assistant', content: 'Consider how consumers scale.' },
      ],
    })

    expect(messages.map(function roleOf(message) { return message.role })).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ])
    expect(messages[0].role).toBe('system')
    expect(messages[1]).toEqual({
      role: 'user',
      content: 'Here is my queue design.',
    })
    expect(messages[2]).toEqual({
      role: 'assistant',
      content: 'Consider how consumers scale.',
    })
    expect(messages[3]).toEqual({
      role: 'user',
      content: 'Should I add a cache layer between these services?',
    })
  })

  it('serializes the Excalidraw snapshot payload into the system prompt', function snapshot() {
    const messages = buildAiChatMessages(BASE_INPUT)
    const systemContent = messages[0].content

    expect(systemContent).toContain('excalidraw_scene')
    expect(systemContent).toContain('rectangle')
    expect(systemContent).toContain('user-queue')
    expect(systemContent).toContain(AI_CHAT_PROMPT_VERSION)
  })

  it('frames guidance as runtime interviewer guidance, not grading or report generation', function runtimeOnly() {
    const systemContent = buildSystemPrompt(BASE_INPUT)

    expect(systemContent).toMatch(/interviewer guidance/i)
    expect(systemContent).toMatch(/not.*grading/i)
    expect(systemContent).toMatch(/report generation/i)
  })

  it('requires a review-oriented style: clarification, gap detection, tradeoffs, and next-step hints', function reviewStyle() {
    const systemContent = buildSystemPrompt(BASE_INPUT)

    expect(systemContent).toMatch(/clarifying questions/i)
    expect(systemContent).toMatch(/gaps/i)
    expect(systemContent).toMatch(/tradeoffs/i)
    expect(systemContent).toMatch(/next-step/i)
  })

  it('grounds guidance only on the supplied snapshot and context', function grounded() {
    const systemContent = buildSystemPrompt(BASE_INPUT)

    expect(systemContent).toMatch(/only on the supplied/i)
    expect(systemContent).toMatch(/do not invent/i)
    expect(systemContent).toMatch(/canvas snapshot/i)
  })

  it('instructs the model to state uncertain or missing context rather than fabricate', function honesty() {
    const systemContent = buildSystemPrompt(BASE_INPUT)

    expect(systemContent).toMatch(/uncertain or missing/i)
    expect(systemContent).toMatch(/explicitly/i)
    expect(systemContent).toMatch(/fabricat/i)
  })

  it('forbids lifecycle, timer, session control, and canvas edit claims', function boundaries() {
    const systemContent = buildSystemPrompt(BASE_INPUT)

    expect(systemContent).toMatch(/never.*lifecycle/i)
    expect(systemContent).toMatch(/timers?/i)
    expect(systemContent).toMatch(/edited the candidate canvas/i)
  })

  it('keeps guidance succinct and candidate-facing', function succinct() {
    const systemContent = buildSystemPrompt(BASE_INPUT)

    expect(systemContent).toMatch(/succinct/i)
    expect(systemContent).toMatch(/candidate-facing/i)
  })

  it('does not require Mermaid as canvas input', function noMermaidRequirement() {
    const systemContent = buildSystemPrompt(BASE_INPUT)

    expect(systemContent).toMatch(/excalidraw/i)
    expect(systemContent.toLowerCase()).not.toContain('mermaid')
  })

  it('provides a safe unsupported-type fallback for coding that does not pretend system-design applies', function codingFallback() {
    const systemContent = buildSystemPrompt({
      ...BASE_INPUT,
      interview_type: 'coding',
    })

    expect(systemContent).toMatch(/not available yet/i)
    expect(systemContent).toMatch(/cannot provide/i)
    expect(systemContent).toMatch(/coding/i)
    expect(systemContent).toMatch(/do not pretend/i)
    expect(systemContent.toLowerCase()).not.toContain('whiteboarding')
    expect(systemContent).not.toContain('Current canvas snapshot')
  })

  it('provides a safe unsupported-type fallback for behavioral', function behavioralFallback() {
    const systemContent = buildSystemPrompt({
      ...BASE_INPUT,
      interview_type: 'behavioral',
    })

    expect(systemContent).toMatch(/behavioral/i)
    expect(systemContent).toMatch(/not available yet/i)
    expect(systemContent).toMatch(/do not pretend/i)
    expect(systemContent.toLowerCase()).not.toContain('whiteboarding')
  })
})
