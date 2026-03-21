import { describe, expect, it } from 'vitest'
import app from './index'

describe('backend-rest smoke tests', function () {
  it('returns health response', async function () {
    const response = await app.request('/health')

    expect(response.status).toBe(200)

    const body = (await response.json()) as {
      status: string
      service: string
      timestamp: string
    }

    expect(body).toMatchObject({
      status: 'ok',
      service: 'backend-rest',
    })
    expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date')
  })

  it('returns root response', async function () {
    const response = await app.request('/')

    expect(response.status).toBe(200)

    const body = (await response.json()) as {
      message: string
      runtime: string
    }

    expect(body).toEqual({
      message: 'Mako backend API is running.',
      runtime: 'cloudflare-workers',
    })
  })
})
