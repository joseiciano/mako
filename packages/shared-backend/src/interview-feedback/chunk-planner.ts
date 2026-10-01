export type ByteRange = { offset: number; length: number }

/**
 * Builds deterministic, bounded byte ranges for Workers AI long-audio
 * transcription (Story 5.16). Each window after the first starts
 * `overlapBytes` before the previous window's end so a chunk boundary never
 * permanently loses audio that fell mid-word; `transcript-assembly.ts`
 * removes the resulting duplicated text when stitching chunk output back
 * together. Deterministic given the same inputs, so replays of the same
 * attempt address the same chunk indexes.
 */
export function computeChunkRanges(
  totalBytes: number,
  chunkBytes: number,
  overlapBytes: number,
): ByteRange[] {
  if (totalBytes <= 0 || chunkBytes <= 0) {
    return []
  }

  const step = Math.max(1, chunkBytes - Math.max(0, overlapBytes))
  const ranges: ByteRange[] = []
  let offset = 0

  while (offset < totalBytes) {
    const length = Math.min(chunkBytes, totalBytes - offset)
    ranges.push({ offset, length })

    if (offset + length >= totalBytes) {
      break
    }

    offset += step
  }

  return ranges
}
