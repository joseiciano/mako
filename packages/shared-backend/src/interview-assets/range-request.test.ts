import { describe, expect, it } from 'vitest'
import { parseRangeHeader } from './range-request'

type ParseCase = {
  name: string
  header: string | undefined
  size: number
  expected:
    | { outcome: 'full' }
    | { outcome: 'range'; range: { offset: number; length: number } }
    | { outcome: 'unsatisfiable' }
}

const cases: ParseCase[] = [
  // Degradation to a full response.
  {
    name: 'undefined header returns full',
    header: undefined,
    size: 100,
    expected: { outcome: 'full' },
  },
  {
    name: 'empty header returns full',
    header: '',
    size: 100,
    expected: { outcome: 'full' },
  },
  {
    name: 'zero-size object returns full',
    header: 'bytes=0-9',
    size: 0,
    expected: { outcome: 'full' },
  },
  {
    name: 'negative-size object returns full',
    header: 'bytes=0-9',
    size: -1,
    expected: { outcome: 'full' },
  },
  {
    name: 'missing unit returns full',
    header: '0-9',
    size: 100,
    expected: { outcome: 'full' },
  },
  {
    name: 'unit other than bytes returns full',
    header: 'chunks=0-9',
    size: 100,
    expected: { outcome: 'full' },
  },
  {
    name: 'empty specifier returns full',
    header: 'bytes=',
    size: 100,
    expected: { outcome: 'full' },
  },
  {
    name: 'multi-range returns full',
    header: 'bytes=0-9,20-29',
    size: 100,
    expected: { outcome: 'full' },
  },
  {
    name: 'specifier without dash returns full',
    header: 'bytes=5',
    size: 100,
    expected: { outcome: 'full' },
  },
  {
    name: 'non-numeric start and end return full',
    header: 'bytes=a-b',
    size: 100,
    expected: { outcome: 'full' },
  },
  {
    name: 'non-numeric end returns full',
    header: 'bytes=0-x',
    size: 100,
    expected: { outcome: 'full' },
  },
  {
    name: 'non-numeric start returns full',
    header: 'bytes=x-9',
    size: 100,
    expected: { outcome: 'full' },
  },
  {
    name: 'negative suffix length returns full',
    header: 'bytes=--5',
    size: 100,
    expected: { outcome: 'full' },
  },

  // Prefix ranges.
  {
    name: 'simple prefix range is preserved',
    header: 'bytes=0-9',
    size: 100,
    expected: { outcome: 'range', range: { offset: 0, length: 10 } },
  },
  {
    name: 'surrounding whitespace is trimmed',
    header: '  bytes=0-9  ',
    size: 100,
    expected: { outcome: 'range', range: { offset: 0, length: 10 } },
  },
  {
    name: 'open-ended range covers the rest of the object',
    header: 'bytes=10-',
    size: 100,
    expected: { outcome: 'range', range: { offset: 10, length: 90 } },
  },
  {
    name: 'start at the last byte yields a one-byte range',
    header: 'bytes=99-',
    size: 100,
    expected: { outcome: 'range', range: { offset: 99, length: 1 } },
  },
  {
    name: 'zero-length explicit range',
    header: 'bytes=0-0',
    size: 100,
    expected: { outcome: 'range', range: { offset: 0, length: 1 } },
  },
  {
    name: 'end beyond object size is clamped to the last byte',
    header: 'bytes=99-99999',
    size: 100,
    expected: { outcome: 'range', range: { offset: 99, length: 1 } },
  },
  {
    name: 'huge end value is clamped',
    header: 'bytes=0-99999999999999999999',
    size: 100,
    expected: { outcome: 'range', range: { offset: 0, length: 100 } },
  },

  // Unsatisfiable ranges.
  {
    name: 'start equal to size is unsatisfiable',
    header: 'bytes=100-',
    size: 100,
    expected: { outcome: 'unsatisfiable' },
  },
  {
    name: 'start beyond size is unsatisfiable',
    header: 'bytes=1000-2000',
    size: 100,
    expected: { outcome: 'unsatisfiable' },
  },
  {
    name: 'huge start value is unsatisfiable',
    header: 'bytes=99999999999999999999-',
    size: 100,
    expected: { outcome: 'unsatisfiable' },
  },

  // Suffix ranges.
  {
    name: 'suffix range resolves against the tail',
    header: 'bytes=-5',
    size: 100,
    expected: { outcome: 'range', range: { offset: 95, length: 5 } },
  },
  {
    name: 'suffix equal to size covers the whole object',
    header: 'bytes=-100',
    size: 100,
    expected: { outcome: 'range', range: { offset: 0, length: 100 } },
  },
  {
    name: 'suffix larger than size covers the whole object',
    header: 'bytes=-500',
    size: 100,
    expected: { outcome: 'range', range: { offset: 0, length: 100 } },
  },
  {
    name: 'zero suffix is unsatisfiable',
    header: 'bytes=-0',
    size: 100,
    expected: { outcome: 'unsatisfiable' },
  },
]

describe('parseRangeHeader', function parseRangeHeaderSuite() {
  for (const testCase of cases) {
    it(`${testCase.name} (header: ${testCase.header ?? 'undefined'}, size: ${testCase.size})`, function run() {
      expect(parseRangeHeader(testCase.header, testCase.size)).toEqual(
        testCase.expected,
      )
    })
  }
})