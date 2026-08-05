import type { AiChatHistoryMessage, InterviewType } from '@mako/shared'

export const AI_CHAT_PROMPT_VERSION = 'system-design-review-v1'

export type AiChatPromptInput = {
  message: string
  chat_history?: AiChatHistoryMessage[]
  interview_type: InterviewType
  guidance_mode: 'review'
  canvas_snapshot: {
    type: 'excalidraw_scene'
    scene: Record<string, unknown>
  }
}

export type AiChatPromptMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const SYSTEM_DESIGN_RUNTIME_GUIDANCE: readonly string[] = [
  'You are an AI interviewer guiding a candidate through a system-design whiteboarding interview in real time.',
  'Your job is runtime interviewer guidance, not post-interview grading, scoring, or report generation.',
  'Use a review-oriented interviewer style: ask clarifying questions, detect gaps, probe tradeoffs, and offer next-step hints.',
  'Ground every statement only on the supplied interview context and Excalidraw canvas snapshot. Do not invent unseen canvas state or assume missing interview context as fact.',
  'When context is uncertain or missing, state that explicitly rather than fabricating an answer.',
  'You must never attempt to control session lifecycle, timers, or interview state, and you must never claim you have edited the candidate canvas.',
  'Keep guidance succinct and candidate-facing.',
]

export function buildAiChatMessages(input: AiChatPromptInput): AiChatPromptMessage[] {
  const messages: AiChatPromptMessage[] = [
    { role: 'system', content: buildSystemPrompt(input) },
  ]

  for (const historyMessage of input.chat_history ?? []) {
    messages.push({
      role: historyMessage.role,
      content: historyMessage.content,
    })
  }

  messages.push({ role: 'user', content: input.message })

  return messages
}

export function buildSystemPrompt(input: AiChatPromptInput): string {
  if (input.interview_type === 'system_design') {
    return buildSystemDesignSystemPrompt(input)
  }

  return buildUnsupportedTypeSystemPrompt(input)
}

export function buildSystemDesignSystemPrompt(input: AiChatPromptInput): string {
  const sceneJson = JSON.stringify(input.canvas_snapshot)

  return [
    `Prompt version: ${AI_CHAT_PROMPT_VERSION}.`,
    ...SYSTEM_DESIGN_RUNTIME_GUIDANCE,
    `Interview type: system_design. Guidance mode: ${input.guidance_mode}.`,
    'The candidate is working on a shared Excalidraw canvas. Use the current canvas snapshot below to ground your guidance.',
    'Current canvas snapshot (serialized Excalidraw payload):',
    sceneJson,
  ].join('\n')
}

export function buildUnsupportedTypeSystemPrompt(input: AiChatPromptInput): string {
  return [
    `Prompt version: ${AI_CHAT_PROMPT_VERSION}.`,
    `You are an AI interviewer in an AI-led session for interview type: ${input.interview_type}.`,
    `Specialized interviewer guidance for the "${input.interview_type}" interview type is not available yet.`,
    'You cannot provide that specialized guidance at this time. Do not pretend a system-design interview prompt applies.',
    'Acknowledge the limitation honestly to the candidate and suggest continuing while noting the missing guidance.',
  ].join('\n')
}
