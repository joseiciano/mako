import {
  RealtimeKitInvalidPublicKeyError,
  RealtimeKitPublicKeyUnavailableError,
  RealtimeKitWebhookError,
} from './types'

export class RealtimeKitSignatureVerificationError extends RealtimeKitWebhookError {
  constructor(message: string) {
    super(message)
    this.name = 'RealtimeKitSignatureVerificationError'
  }
}

export type RealtimeKitSignatureVerifier = {
  verify(input: {
    rawBody: ArrayBuffer
    signatureBase64: string
  }): Promise<boolean>
}

export type RealtimeKitSignatureVerifierDependencies = {
  publicKeyProvider: RealtimeKitPublicKeyProvider
  subtle: SubtleCrypto
}

export type RealtimeKitPublicKeyProvider = {
  getPublicKeyDer(): Promise<ArrayBuffer>
}

export function createRealtimeKitSignatureVerifier(
  dependencies: RealtimeKitSignatureVerifierDependencies,
): RealtimeKitSignatureVerifier {
  return {
    async verify(input) {
      let signatureBytes: Uint8Array<ArrayBuffer>
      try {
        signatureBytes = decodeBase64ToBytes(input.signatureBase64)
      } catch {
        return false
      }

      const publicKeyDer = await dependencies.publicKeyProvider.getPublicKeyDer()

      const publicKey = await dependencies.subtle.importKey(
        'spki',
        publicKeyDer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      )

      return dependencies.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        publicKey,
        signatureBytes,
        input.rawBody,
      )
    },
  }
}

// Decodes a PEM "PUBLIC KEY" (SPKI) body into DER bytes.
export function parsePemPublicKey(pem: string): ArrayBuffer {
  const lines = pem.split('\n').map(function stripLine(line) {
    return line.trim()
  })

  const headerIndex = lines.findIndex(function isHeader(line) {
    return line.startsWith('-----BEGIN') && line.includes('PUBLIC KEY')
  })
  const footerIndex = lines.findIndex(function isFooter(line) {
    return line.startsWith('-----END') && line.includes('PUBLIC KEY')
  })

  if (headerIndex === -1 || footerIndex === -1 || footerIndex <= headerIndex) {
    throw new RealtimeKitInvalidPublicKeyError('Public key PEM is malformed.')
  }

  const body = lines.slice(headerIndex + 1, footerIndex).join('')

  try {
    return decodeBase64ToBytes(body).buffer
  } catch {
    throw new RealtimeKitInvalidPublicKeyError('Public key PEM body is not valid base64.')
  }
}

export function decodeBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}
