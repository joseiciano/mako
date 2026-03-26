import { renderToString } from 'react-dom/server'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { Route } from './routes/index'

describe('frontend workspace smoke tests', function () {
  it('renders the homepage route', function () {
    const renderHomePage = Route.options.component as () => ReactElement
    const html = renderToString(renderHomePage())

    expect(html).toContain('Mako Interview Practice')
    expect(html).toContain('frontend • ok')
  })
})
