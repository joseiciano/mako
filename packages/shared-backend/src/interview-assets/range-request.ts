import type { R2Range } from './types'

export type ParsedRangeRequest =
  | { outcome: 'full' }
  | { outcome: 'range'; range: R2Range }
  | { outcome: 'unsatisfiable' }

const RANGE_UNIT = 'bytes'

/**
 * Parses a single `Range` header against a known object size.
 *
 * Malformed, multi-range, and non-`bytes` requests degrade to a full-body
 * response (`full`); syntactically valid but out-of-bounds ranges report
 * `unsatisfiable` so the caller can answer `416` with a `Content-Range`
 * trailer. Suffix requests (`bytes=-N`) resolve against the object tail.
 */
export function parseRangeHeader(header: string | undefined, size: number): ParsedRangeRequest {
  if (size <= 0 || !header) {
    return { outcome: 'full' }
  }

  const trimmed = header.trim()
  const equalsIndex = trimmed.indexOf('=')
  if (equalsIndex <= 0) {
    return { outcome: 'full' }
  }

  const unit = trimmed.slice(0, equalsIndex).trim().toLowerCase()
  if (unit !== RANGE_UNIT) {
    return { outcome: 'full' }
  }

  const specifier = trimmed.slice(equalsIndex + 1).trim()
  if (specifier === '' || specifier.includes(',')) {
    return { outcome: 'full' }
  }

  const dashIndex = specifier.indexOf('-')
  if (dashIndex < 0) {
    return { outcome: 'full' }
  }

  const startText = specifier.slice(0, dashIndex).trim()
  const endText = specifier.slice(dashIndex + 1).trim()

  if (startText === '') {
    // Suffix form: `bytes=-N` requests the final N bytes.
    if (!/^\d+$/.test(endText)) {
      return { outcome: 'full' }
    }
    const suffixLength = Number(endText)
    if (suffixLength === 0) {
      return { outcome: 'unsatisfiable' }
    }
    const length = Math.min(suffixLength, size)
    return { outcome: 'range', range: { offset: size - length, length } }
  }

  if (!/^\d+$/.test(startText)) {
    return { outcome: 'full' }
  }

  const offset = Number(startText)
  if (offset >= size) {
    return { outcome: 'unsatisfiable' }
  }

  if (endText === '') {
    return { outcome: 'range', range: { offset, length: size - offset } }
  }

  if (!/^\d+$/.test(endText)) {
    return { outcome: 'full' }
  }

  const end = Math.min(Number(endText), size - 1)
  return { outcome: 'range', range: { offset, length: end - offset + 1 } }
}
