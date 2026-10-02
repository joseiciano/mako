import { describe, expect, it } from 'vitest'
import { appendChunkText, buildRoleLabeledTranscript, truncateTranscript } from './transcript-assembly'

describe('appendChunkText', function suite() {
  it('returns the chunk text as-is when nothing has been accumulated yet', function run() {
    expect(appendChunkText('', 'hello there', 20)).toBe('hello there')
  })

  it('returns the accumulated text unchanged when the chunk is empty', function run() {
    expect(appendChunkText('hello there', '   ', 20)).toBe('hello there')
  })

  it('strips a duplicated leading run of words that overlaps the accumulated tail', function run() {
    const accumulated = 'the quick brown fox jumps over'
    const chunk = 'jumps over the lazy dog'

    expect(appendChunkText(accumulated, chunk, 20)).toBe('the quick brown fox jumps over the lazy dog')
  })

  it('is case-insensitive when matching overlap text', function run() {
    const accumulated = 'and then we discussed Big O'
    const chunk = 'big o notation for the algorithm'

    expect(appendChunkText(accumulated, chunk, 20)).toBe(
      'and then we discussed Big O notation for the algorithm',
    )
  })

  it('appends the whole chunk with a separating space when there is no overlap', function run() {
    expect(appendChunkText('first part', 'second part', 20)).toBe('first part second part')
  })

  it('does not grow the transcript when the chunk is wholly contained in the overlap window', function run() {
    const accumulated = 'one two three four five'
    const chunk = 'four five'

    expect(appendChunkText(accumulated, chunk, 20)).toBe('one two three four five')
  })

  it('bounds the overlap search to maxOverlapWords, leaving a longer true overlap undeduped', function run() {
    // The true overlap is the 3-word run "a b c", but maxOverlapWords caps the
    // search window at 2 words, so that longer match is never checked and the
    // duplicated text is appended rather than stripped.
    const accumulated = 'x y a b c'
    const chunk = 'a b c d e'

    expect(appendChunkText(accumulated, chunk, 2)).toBe('x y a b c a b c d e')
  })
})

describe('truncateTranscript', function suite() {
  it('returns the transcript unchanged when within the limit', function run() {
    expect(truncateTranscript('short transcript', 1000)).toBe('short transcript')
  })

  it('truncates and appends a marker when over the limit', function run() {
    const transcript = 'a'.repeat(100)
    const result = truncateTranscript(transcript, 50)

    expect(result.length).toBe(50)
    expect(result.endsWith('[transcript truncated]')).toBe(true)
    expect(result.startsWith('a')).toBe(true)
  })

  it('never produces a negative slice length for a very small limit', function run() {
    const transcript = 'a'.repeat(100)
    expect(() => truncateTranscript(transcript, 1)).not.toThrow()
  })
})

describe('buildRoleLabeledTranscript', function suite() {
  it('labels and orders candidate before interviewer', function run() {
    const result = buildRoleLabeledTranscript([
      { participantRole: 'interviewer', text: 'How would you approach this?' },
      { participantRole: 'candidate', text: 'I would start by clarifying requirements.' },
    ])

    expect(result).toBe(
      '[Interviewer]\nHow would you approach this?\n\n[Candidate]\nI would start by clarifying requirements.',
    )
  })

  it('omits sections with empty or whitespace-only text', function run() {
    const result = buildRoleLabeledTranscript([
      { participantRole: 'candidate', text: '   ' },
      { participantRole: 'interviewer', text: 'Hello?' },
    ])

    expect(result).toBe('[Interviewer]\nHello?')
  })

  it('falls back to the raw role string for an unknown role', function run() {
    const result = buildRoleLabeledTranscript([{ participantRole: 'observer', text: 'Noted.' }])

    expect(result).toBe('[observer]\nNoted.')
  })

  it('returns an empty string when every section is empty', function run() {
    expect(buildRoleLabeledTranscript([{ participantRole: 'candidate', text: '' }])).toBe('')
  })
})
