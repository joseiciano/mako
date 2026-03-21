import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const currentFile = fileURLToPath(import.meta.url)
const currentDirectory = path.dirname(currentFile)
const packageDirectory = path.resolve(currentDirectory, '..')
const migrationsDirectory = path.join(packageDirectory, 'migrations')

function normalizeMigrationName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function buildTimestampPrefix(date) {
  return date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
}

async function main() {
  const nameArgument = process.argv.slice(2).join(' ')
  const normalizedName = normalizeMigrationName(nameArgument)

  if (!normalizedName) {
    throw new Error(
      'Migration name is required. Example: pnpm db:migration:create -- add_user_indexes',
    )
  }

  const timestampPrefix = buildTimestampPrefix(new Date())
  const fileName = `${timestampPrefix}_${normalizedName}.sql`
  const filePath = path.join(migrationsDirectory, fileName)
  const fileTemplate = [
    `-- Migration: ${fileName}`,
    `-- Created at: ${new Date().toISOString()}`,
    '',
    '-- Write SQL statements below this line.',
    '',
  ].join('\n')

  await mkdir(migrationsDirectory, { recursive: true })
  await writeFile(filePath, fileTemplate, { flag: 'wx' })

  process.stdout.write(`Created migration: ${fileName}\n`)
}

main().catch(function handleError(error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`Failed to create migration: ${message}\n`)
  process.exitCode = 1
})
