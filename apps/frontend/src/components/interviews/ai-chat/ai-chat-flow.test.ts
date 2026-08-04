import { describe, expect, it } from 'vitest'
import type { AIChatMessage } from './ai-chat-types'
import {
  aiChatPanelReducer,
  buildChatHistory,
  initialAIChatPanelState,
} from './ai-chat-flow'

describe('ai-chat-flow reducer', function () {
  it('starts in idle state with empty messages', function () {
    expect(initialAIChatPanelState).toEqual({
      messages: [],
      inputValue: '',
      submitState: 'idle',
      errorMessage: null,
      lastFailedMessageContent: null,
    })
  })

  it('updates input value on INPUT_CHANGED', function () {
    const state = aiChatPanelReducer(initialAIChatPanelState, {
      type: 'INPUT_CHANGED',
      payload: 'hello',
    })
    expect(state.inputValue).toBe('hello')
    expect(state.submitState).toBe('idle')
  })

  it('clears error message when typing new input', function () {
    const failed: ReturnType<typeof aiChatPanelReducer> = {
      ...initialAIChatPanelState,
      submitState: 'error',
      errorMessage: 'Unable to get an AI response.',
      lastFailedMessageContent: 'hello',
    }
    const state = aiChatPanelReducer(failed, {
      type: 'INPUT_CHANGED',
      payload: 'n',
    })
    expect(state.errorMessage).toBeNull()
  })

  it('appends user message and enters sending on SUBMIT_STARTED', function () {
    const state = aiChatPanelReducer(initialAIChatPanelState, {
      type: 'SUBMIT_STARTED',
      payload: 'Tell me about my design',
    })
    expect(state.submitState).toBe('sending')
    expect(state.inputValue).toBe('')
    expect(state.errorMessage).toBeNull()
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0]).toMatchObject({
      role: 'user',
      content: 'Tell me about my design',
    })
  })

  it('appends assistant reply and enters success on SUBMIT_SUCCEEDED', function () {
    const started = aiChatPanelReducer(initialAIChatPanelState, {
      type: 'SUBMIT_STARTED',
      payload: 'hi',
    })
    const state = aiChatPanelReducer(started, {
      type: 'SUBMIT_SUCCEEDED',
      payload: 'Consider a cache.',
    })
    expect(state.submitState).toBe('success')
    expect(state.messages).toHaveLength(2)
    expect(state.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'Consider a cache.',
    })
    expect(state.messages[1]?.isError).not.toBe(true)
  })

  it('marks last user message in error and stores content on SUBMIT_FAILED', function () {
    const started = aiChatPanelReducer(initialAIChatPanelState, {
      type: 'SUBMIT_STARTED',
      payload: 'my question',
    })
    const state = aiChatPanelReducer(started, {
      type: 'SUBMIT_FAILED',
      payload: 'Unable to get an AI response.',
    })
    expect(state.submitState).toBe('error')
    expect(state.errorMessage).toBe('Unable to get an AI response.')
    expect(state.lastFailedMessageContent).toBe('my question')
    expect(state.messages[0]?.isError).toBe(true)
  })

  it('appends assistant reply and clears error on RETRY_SUCCEEDED', function () {
    const started = aiChatPanelReducer(initialAIChatPanelState, {
      type: 'SUBMIT_STARTED',
      payload: 'my question',
    })
    const failed = aiChatPanelReducer(started, {
      type: 'SUBMIT_FAILED',
      payload: 'Unable to get an AI response.',
    })
    const retried = aiChatPanelReducer(failed, { type: 'RETRY_STARTED' })
    const state = aiChatPanelReducer(retried, {
      type: 'RETRY_SUCCEEDED',
      payload: 'Good answer!',
    })
    expect(state.submitState).toBe('success')
    expect(state.errorMessage).toBeNull()
    expect(state.messages.length).toBe(2)
    expect(state.messages[0]?.isError).toBe(false)
    expect(state.messages[1]).toMatchObject({ role: 'assistant', content: 'Good answer!' })
  })

  it('keeps error state on RETRY_FAILED', function () {
    const started = aiChatPanelReducer(initialAIChatPanelState, {
      type: 'SUBMIT_STARTED',
      payload: 'my question',
    })
    const failed = aiChatPanelReducer(started, {
      type: 'SUBMIT_FAILED',
      payload: 'Unable to get an AI response.',
    })
    const retried = aiChatPanelReducer(failed, { type: 'RETRY_STARTED' })
    const state = aiChatPanelReducer(retried, {
      type: 'RETRY_FAILED',
      payload: 'Still failing.',
    })
    expect(state.submitState).toBe('error')
    expect(state.errorMessage).toBe('Still failing.')
  })

  it('clears retry target on RETRY_SUCCEEDED', function () {
    const started = aiChatPanelReducer(initialAIChatPanelState, {
      type: 'SUBMIT_STARTED',
      payload: 'my question',
    })
    const failed = aiChatPanelReducer(started, {
      type: 'SUBMIT_FAILED',
      payload: 'Unable to get an AI response.',
    })
    const retried = aiChatPanelReducer(failed, { type: 'RETRY_STARTED' })
    const state = aiChatPanelReducer(retried, {
      type: 'RETRY_SUCCEEDED',
      payload: 'Ok.',
    })
    expect(state.submitState).toBe('success')
    expect(state.lastFailedMessageContent).toBeNull()
  })

  it('shows error without retry target on SUBMIT_REJECTED and keeps input', function () {
    const state = aiChatPanelReducer(initialAIChatPanelState, {
      type: 'SUBMIT_REJECTED',
      payload: 'Whiteboard is still loading.',
    })
    expect(state.submitState).toBe('error')
    expect(state.errorMessage).toBe('Whiteboard is still loading.')
    expect(state.lastFailedMessageContent).toBeNull()
    expect(state.messages).toHaveLength(0)
  })

})

describe('buildChatHistory', function () {
  function message(role: 'user' | 'assistant', content: string, isError?: boolean): AIChatMessage {
    return { id: `${role}-${content}`, role, content, isError }
  }

  it('returns empty history for empty messages', function () {
    expect(buildChatHistory([])).toEqual([])
  })

  it('maps messages to role/content pairs', function () {
    const history = buildChatHistory([
      message('user', 'q1'),
      message('assistant', 'a1'),
    ])
    expect(history).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
    ])
  })

  it('omits failed (error) user messages from history', function () {
    const history = buildChatHistory([
      message('user', 'failed q', true),
      message('assistant', 'a1'),
    ])
    expect(history).toEqual([{ role: 'assistant', content: 'a1' }])
  })

  it('bounds history to the last 8 messages', function () {
    const many: AIChatMessage[] = []
    for (let index = 0; index < 12; index += 1) {
      many.push(message(index % 2 === 0 ? 'user' : 'assistant', `msg-${index}`))
    }
    const history = buildChatHistory(many)
    expect(history).toHaveLength(8)
    expect(history[0]?.content).toBe('msg-4')
    expect(history[7]?.content).toBe('msg-11')
  })

  it('truncates content longer than the history limit', function () {
    const longText = 'x'.repeat(800)
    const history = buildChatHistory([message('user', longText)])
    expect(history[0]?.content.length).toBeLessThanOrEqual(750)
    expect(history[0]?.content.endsWith('x'.repeat(750))).toBe(true)
  })
})
