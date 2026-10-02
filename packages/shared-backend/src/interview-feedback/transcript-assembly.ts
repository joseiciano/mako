const WORD_PATTERN = /\s+/

/**
 * Appends one chunk's transcript text onto the accumulated transcript for a
 * track, stripping a leading run of words that duplicates the end of the
 * accumulated text. Chunk windows deliberately overlap (see
 * `chunk-planner.ts`) so a word is never permanently lost at a boundary;
 * this is the dedupe step that keeps the overlap from appearing twice.
 */
export function appendChunkText(
  accumulated: string,
  chunkText: string,
  maxOverlapWords: number,
): string {
  const trimmedChunk = chunkText.trim()
  if (trimmedChunk === '') {
    return accumulated
  }

  const trimmedAccumulated = accumulated.trim()
  if (trimmedAccumulated === '') {
    return trimmedChunk
  }

  const overlapWordCount = findOverlapWordCount(trimmedAccumulated, trimmedChunk, maxOverlapWords)
  const chunkWords = trimmedChunk.split(WORD_PATTERN)
  const remainder = chunkWords.slice(overlapWordCount).join(' ').trim()

  if (remainder === '') {
    return trimmedAccumulated
  }

  return `${trimmedAccumulated} ${remainder}`
}

/**
 * Finds the longest run (bounded by `maxOverlapWords`) of trailing words in
 * `accumulated` that exactly matches (case-insensitively) a leading run of
 * words in `chunkText`. Returns 0 when no overlap is found.
 */
function findOverlapWordCount(
  accumulated: string,
  chunkText: string,
  maxOverlapWords: number,
): number {
  const accumulatedWords = accumulated.split(WORD_PATTERN)
  const chunkWords = chunkText.split(WORD_PATTERN)
  const maxCheck = Math.min(maxOverlapWords, accumulatedWords.length, chunkWords.length)

  for (let count = maxCheck; count > 0; count -= 1) {
    const accumulatedTail = accumulatedWords
      .slice(accumulatedWords.length - count)
      .join(' ')
      .toLowerCase()
    const chunkHead = chunkWords.slice(0, count).join(' ').toLowerCase()

    if (accumulatedTail === chunkHead) {
      return count
    }
  }

  return 0
}

/** Truncates a transcript to a bounded length, preserving the beginning. */
export function truncateTranscript(transcript: string, maxChars: number): string {
  if (transcript.length <= maxChars) {
    return transcript
  }

  const truncationMarker = '\n[transcript truncated]'
  const boundedLength = Math.max(0, maxChars - truncationMarker.length)
  return `${transcript.slice(0, boundedLength)}${truncationMarker}`
}

const ROLE_LABELS: Readonly<Record<string, string>> = {
  candidate: 'Candidate',
  interviewer: 'Interviewer',
}

export type RoleTranscript = {
  participantRole: string
  text: string
}

/**
 * Combines per-role, chunk-ordered transcripts into one bounded,
 * role-labelled transcript. Each participant's audio is a separate
 * RealtimeKit track, so role sections are ordered deterministically
 * (candidate first) rather than claiming cross-track wall-clock ordering
 * that the available per-track chunk data cannot support.
 */
export function buildRoleLabeledTranscript(roleTranscripts: readonly RoleTranscript[]): string {
  const sections = roleTranscripts
    .filter(function hasText(entry) {
      return entry.text.trim() !== ''
    })
    .map(function toSection(entry) {
      const label = ROLE_LABELS[entry.participantRole] ?? entry.participantRole
      return `[${label}]\n${entry.text.trim()}`
    })

  return sections.join('\n\n')
}
