import type {
  AiChatServiceInput,
  AiChatServicePort,
  AiChatServiceResult,
} from './types'

export class AiChatRepository {
  constructor(private readonly responder?: AiChatServicePort) {}

  async generateReply(input: AiChatServiceInput): Promise<AiChatServiceResult> {
    if (!this.responder) {
      throw new AiChatUnavailableError()
    }

    return this.responder.generateReply(input)
  }
}

export class AiChatUnavailableError extends Error {
  constructor(message = 'AI chat is not configured.') {
    super(message)
    this.name = 'AiChatUnavailableError'
  }
}
