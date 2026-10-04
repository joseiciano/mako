import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const routeTree = readFileSync(resolve(__dirname, '../routeTree.gen.ts'), 'utf8')

describe('interviewer application route', function suite() {
  it('is registered at /settings/interviewer-application under the authenticated tree', function run() {
    expect(routeTree).toContain("'/_authenticated/settings/interviewer-application'")
    expect(routeTree).toContain("fullPath: '/settings/interviewer-application'")
  })

  it('inherits authentication (login redirect) from the _authenticated layout', function run() {
    const routeSource = readFileSync(
      resolve(__dirname, '_authenticated.settings.interviewer-application.tsx'),
      'utf8',
    )
    expect(routeSource).toContain("createFileRoute('/_authenticated/settings/interviewer-application')")

    const layoutSource = readFileSync(resolve(__dirname, '_authenticated.tsx'), 'utf8')
    expect(layoutSource).toMatch(/redirect\(\{\s*to:\s*'\/login'/)
  })
})
