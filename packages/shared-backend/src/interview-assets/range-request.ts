import type { R2Range } from './types'

export type ParsedRangeRequest =
  | { outcome: 'full' }
  | { outcome: 'range'; range: R2Range }
  | { outcome: 'unsatisfiable' }

/**
 * Exact `start > end` comparison for validated digit strings: strips leading
 * zeros, compares by length, then lexicographically — so values beyond
 * `Number.MAX_SAFE_INTEGER` keep their ordering. Equal start/end is NOT
 * descending (it is a valid one-byte range).
 */
function isByteOrderDescending(startText: string, endText: string): boolean {
  const start = startText.replace(/^0+(?=\d)/, '')
  const end = endText.replace(/^0+(?=\d)/, '')
  if (start.length !== end.length) {
    return start.length > end.length
  }
  return start > end
}

const RANGE_UNIT = 'bytes'

/**
 * Parses a single `Range` header against a known object size.
 *
 * Malformed, multi-range, non-`bytes`, and invalid (end-before-start)
 * requests degrade to a full-body response (`full`); syntactically valid but
 * out-of-bounds ranges report `unsatisfiable` so the caller can answer `416`
 * with a `Content-Range` trailer. Suffix requests (`bytes=-N`) resolve
 * against the object tail.
 */
export function parseRangeHeader(header: string | undefined, size: number): ParsedRangeRequest {
  if (!header) {
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

  const startText = specifier.slice(0, dashIndex)
  const endText = specifier.slice(dashIndex + 1)

  if (startText === '') {
    // Suffix form: `bytes=-N` requests the final N bytes.
    if (!/^\d+$/.test(endText)) {
      return { outcome: 'full' }
    }
  } else if (!/^\d+$/.test(startText)) {
    return { outcome: 'full' }
  } else if (endText !== '' && !/^\d+$/.test(endText)) {
    return { outcome: 'full' }
  } else if (endText !== '' && isByteOrderDescending(startText, endText)) {
    // RFC 9110: a byte-range-spec whose end precedes its start is invalid
    // and invalidates the whole header. Compared digit-wise because values
    // beyond Number.MAX_SAFE_INTEGER collapse under Number comparison.
    return { outcome: 'full' }
  }

  // Every syntactically valid range on an empty object is out of bounds.
  if (size <= 0) {
    return { outcome: 'unsatisfiable' }
  }

  if (startText === '') {
    const suffixLength = Number(endText)
    if (suffixLength === 0) {
      return { outcome: 'unsatisfiable' }
    }
    const length = Math.min(suffixLength, size)
    return { outcome: 'range', range: { offset: size - length, length } }
  }

  const offset = Number(startText)
  if (offset >= size) {
    return { outcome: 'unsatisfiable' }
  }

  if (endText === '') {
    return { outcome: 'range', range: { offset, length: size - offset } }
  }

  const end = Math.min(Number(endText), size - 1)
  return { outcome: 'range', range: { offset, length: end - offset + 1 } }
}
