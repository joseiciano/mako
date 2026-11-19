import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')

export async function readJsoncConfig(sourcePath) {
  const parsedConfig = ts.parseConfigFileTextToJson(
    sourcePath,
    await readFile(sourcePath, 'utf8'),
  )

  if (parsedConfig.error) {
    throw new Error(
      `Cannot parse ${sourcePath}: ${ts.flattenDiagnosticMessageText(parsedConfig.error.messageText, '\n')}`,
    )
  }

  return parsedConfig.config
}
