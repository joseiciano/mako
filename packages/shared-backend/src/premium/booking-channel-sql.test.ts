import { describe, expect, it } from 'vitest'
import { bookingChannelSelect } from './booking-channel-sql'

describe('booking channel sql', function suite() {
  it('selects booking_channel directly with no COALESCE fallback after DB contraction', function run() {
    expect(bookingChannelSelect).toBe('booking_channel')
    expect(bookingChannelSelect).not.toContain('COALESCE')
  })
})
