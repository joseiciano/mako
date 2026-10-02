import { describe, expect, it } from 'vitest'
import { computeChunkRanges } from './chunk-planner'

describe('computeChunkRanges', function suite() {
  it('returns an empty array for a zero-byte or negative size', function run() {
    expect(computeChunkRanges(0, 100, 10)).toEqual([])
    expect(computeChunkRanges(-5, 100, 10)).toEqual([])
  })

  it('returns one range when the file fits in a single chunk', function run() {
    expect(computeChunkRanges(50, 100, 10)).toEqual([{ offset: 0, length: 50 }])
  })

  it('returns one exact-length range when the file equals the chunk size', function run() {
    expect(computeChunkRanges(100, 100, 10)).toEqual([{ offset: 0, length: 100 }])
  })

  it('produces overlapping bounded windows for a file spanning multiple chunks', function run() {
    // step = 100 - 10 = 90
    // window 0: [0, 100) -> offset 0 length 100
    // window 1: [90, 190) -> offset 90 length 100
    // window 2: [180, 220) -> offset 180 length 40 (clipped to total)
    const ranges = computeChunkRanges(220, 100, 10)

    expect(ranges).toEqual([
      { offset: 0, length: 100 },
      { offset: 90, length: 100 },
      { offset: 180, length: 40 },
    ])
  })

  it('is deterministic given the same inputs', function run() {
    const first = computeChunkRanges(1_234_567, 20 * 1024 * 1024, 64 * 1024)
    const second = computeChunkRanges(1_234_567, 20 * 1024 * 1024, 64 * 1024)

    expect(first).toEqual(second)
  })

  it('treats a non-positive overlap as zero overlap (contiguous, non-overlapping chunks)', function run() {
    expect(computeChunkRanges(250, 100, 0)).toEqual([
      { offset: 0, length: 100 },
      { offset: 100, length: 100 },
      { offset: 200, length: 50 },
    ])
  })

  it('never produces a step of zero when overlap meets or exceeds the chunk size', function run() {
    const ranges = computeChunkRanges(300, 100, 100)

    // step clamps to a minimum of 1 byte so the loop always terminates.
    expect(ranges.length).toBeGreaterThan(0)
    expect(ranges[ranges.length - 1]!.offset + ranges[ranges.length - 1]!.length).toBe(300)
  })
})
