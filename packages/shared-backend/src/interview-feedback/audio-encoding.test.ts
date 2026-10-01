import { describe, expect, it } from 'vitest'
import { arrayBufferToBase64, streamToBase64 } from './audio-encoding'

describe('arrayBufferToBase64', function suite() {
  it('encodes an empty buffer as an empty string', function run() {
    expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe('')
  })

  it('encodes bytes to standard base64', function run() {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]) // "Hello"
    expect(arrayBufferToBase64(bytes.buffer as ArrayBuffer)).toBe('SGVsbG8=')
  })
})

describe('streamToBase64', function suite() {
  it('reads a stream fully and base64-encodes its bytes', async function run() {
    const bytes = new Uint8Array([1, 2, 3, 4, 5])
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      },
    })

    const result = await streamToBase64(stream)

    expect(result).toBe(arrayBufferToBase64(bytes.buffer as ArrayBuffer))
  })

  it('reads a multi-chunk stream into one contiguous encoding', async function run() {
    const first = new Uint8Array([10, 20, 30])
    const second = new Uint8Array([40, 50])
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(first)
        controller.enqueue(second)
        controller.close()
      },
    })

    const result = await streamToBase64(stream)
    const expected = arrayBufferToBase64(new Uint8Array([10, 20, 30, 40, 50]).buffer as ArrayBuffer)

    expect(result).toBe(expected)
  })
})
