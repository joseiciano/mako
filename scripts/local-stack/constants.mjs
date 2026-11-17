import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)
export const composeFilePath = path.join(rootDirectory, 'docker-compose.local.yml')
export const composeProjectName = 'mako-local'
export const postgresHostPort = 54332
export const defaultDatabaseUrl =
  'postgres://postgres:postgres@postgres:5432/mako_local?sslmode=disable'
