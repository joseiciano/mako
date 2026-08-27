import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(currentDirectory, '../../../')

function readRepositoryFile(...segments: string[]): string {
  return readFileSync(resolve(repositoryRoot, ...segments), 'utf8')
}

describe('story 5.11 realtimekit recording finalization infrastructure lock', function () {
  it('terraform owns cloudflare_workflow recording_finalization targeting notification-orchestrator and binds RECORDING_FINALIZATION_WORKFLOW in both workers', function () {
    const terraformMain = readRepositoryFile('infrastructure', 'main.tf')
    const terraformVariables = readRepositoryFile('infrastructure', 'variables.tf')

    expect(terraformMain).toContain('resource "cloudflare_workflow" "recording_finalization"')
    expect(terraformMain).toContain('RECORDING_FINALIZATION_WORKFLOW')

    // variables for workflow ownership (name + class)
    expect(terraformVariables).toContain('recording_finalization_workflow_name')
    expect(terraformVariables).toContain('recording_finalization_workflow_class_name')
    expect(terraformVariables).toContain('RecordingFinalizationWorkflow')

    // workflow resource itself may reference script resource (allowed)
    expect(terraformMain).toContain('resource "cloudflare_workflow" "recording_finalization"')
    expect(terraformMain).toContain('var.recording_finalization_workflow_name')
    expect(terraformMain).toContain('var.recording_finalization_workflow_class_name')

    // both workers bind the workflow for handoff (webhook) and sweep (scheduled)
    expect(terraformMain).toContain('resource "cloudflare_workers_script" "notification_orchestrator"')
    expect(terraformMain).toContain('resource "cloudflare_workers_script" "backend_api"')
    // binding name appears at least twice (once per worker)
    const bindingMatches = terraformMain.match(/RECORDING_FINALIZATION_WORKFLOW/g) ?? []
    expect(bindingMatches.length).toBeGreaterThanOrEqual(2)

    // Stable binding references: workflow bindings must use vars/literals, not resource references that create cycles
    const notifStart = terraformMain.indexOf('resource "cloudflare_workers_script" "notification_orchestrator"')
    const workflowStart = terraformMain.indexOf('resource "cloudflare_workflow" "interview_feedback"')
    const notifBlock = terraformMain.slice(notifStart, workflowStart)
    expect(notifBlock).toContain('var.recording_finalization_workflow_name')
    expect(notifBlock).toContain('var.notification_orchestrator_worker_script_name')
    expect(notifBlock).not.toContain('cloudflare_workflow.recording_finalization.workflow_name')
    expect(notifBlock).not.toContain('cloudflare_workers_script.notification_orchestrator.script_name')

    const backendStart = terraformMain.indexOf('resource "cloudflare_workers_script" "backend_api"')
    const backendBlock = terraformMain.slice(backendStart, backendStart + 4000)
    expect(backendBlock).toContain('var.recording_finalization_workflow_name')
    expect(backendBlock).toContain('var.notification_orchestrator_worker_script_name')
    expect(backendBlock).not.toContain('cloudflare_workflow.recording_finalization.workflow_name')
  })

  it('notification-orchestrator wrangler mirrors workflow class locally', function () {
    const orchestratorWrangler = readRepositoryFile('apps', 'notification-orchestrator', 'wrangler.jsonc')

    expect(orchestratorWrangler).toContain('RECORDING_FINALIZATION_WORKFLOW')
    expect(orchestratorWrangler).toContain('RecordingFinalizationWorkflow')
    expect(orchestratorWrangler).toContain('recording-finalization')
  })

  it('backend wrangler configures RECORDING_FINALIZATION_WORKFLOW with class_name RecordingFinalizationWorkflow and external script_name', function () {
    const backendWrangler = readRepositoryFile('apps', 'backend-rest', 'wrangler.jsonc')
    const bindingIdx = backendWrangler.indexOf('"RECORDING_FINALIZATION_WORKFLOW"')
    expect(bindingIdx).toBeGreaterThan(-1)
    const blockStart = backendWrangler.lastIndexOf('{', bindingIdx)
    const blockEnd = backendWrangler.indexOf('}', bindingIdx)
    expect(blockStart).toBeGreaterThan(-1)
    expect(blockEnd).toBeGreaterThan(blockStart)
    const block = backendWrangler.slice(blockStart, blockEnd + 1)
    expect(block).toContain('"binding"')
    expect(block).toContain('"RECORDING_FINALIZATION_WORKFLOW"')
    expect(block).toContain('"class_name"')
    expect(block).toContain('"RecordingFinalizationWorkflow"')
    expect(block).toContain('"script_name"')
    expect(block).toContain('"mako-notification-orchestrator"')
    expect(block).toContain('"name"')
    expect(block).toContain('"recording-finalization-workflow"')
  })

  it('backend wrangler configures REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL as plain_text well-known URL not a secret', function () {
    const backendWrangler = readRepositoryFile('apps', 'backend-rest', 'wrangler.jsonc')

    expect(backendWrangler).toContain('REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL')
    expect(backendWrangler).toContain('https://api.realtime.cloudflare.com/.well-known/webhooks.json')
  })
  it('stale REALTIMEKIT_WEBHOOK_PUBLIC_KEY secret references are removed from scripts and docs', function () {
    const backendWrangler = readRepositoryFile('apps', 'backend-rest', 'wrangler.jsonc')
    const backendDoc = readRepositoryFile('docs', 'infrastructure', 'backend.md')
    const cicdDoc = readRepositoryFile('docs', 'system', 'system-design', 'ci-cd.md')
    const secretScript = readRepositoryFile('scripts', 'set-github-env-secrets.sh')
    const deployWorkflow = readRepositoryFile('.github', 'workflows', 'deploy-applications.yml')

    // The obsolete name without _URL suffix must not appear; the new var is _PUBLIC_KEY_URL
    const obsoletePattern = /REALTIMEKIT_WEBHOOK_PUBLIC_KEY(?!_URL)/

    expect(backendWrangler).not.toMatch(obsoletePattern)
    expect(backendDoc).not.toMatch(obsoletePattern)
    expect(cicdDoc).not.toMatch(obsoletePattern)
    expect(secretScript).not.toMatch(obsoletePattern)
    expect(deployWorkflow).not.toMatch(obsoletePattern)
  })

  it('notification-orchestrator deployment syncs existing realtime credentials into runtime for fresh recording lookup', function () {
    const deployWorkflow = readRepositoryFile('.github', 'workflows', 'deploy-applications.yml')

    // deploy-notification-orchestrator job must validate and sync the three existing realtime vars
    expect(deployWorkflow).toContain('deploy-notification-orchestrator')
    expect(deployWorkflow).toContain('CLOUDFLARE_ACCOUNT_ID')
    expect(deployWorkflow).toContain('CLOUDFLARE_API_TOKEN')
    expect(deployWorkflow).toContain('CLOUDFLARE_REALTIMEKIT_APP_ID')

    // ensure they appear in the orchestrator's secret sync block, not only backend-rest
    const orchestratorSection = deployWorkflow.slice(
      deployWorkflow.indexOf('deploy-notification-orchestrator'),
    )
    expect(orchestratorSection).toContain('CLOUDFLARE_REALTIMEKIT_APP_ID')
    expect(orchestratorSection).toContain('CLOUDFLARE_ACCOUNT_ID')
    expect(orchestratorSection).toContain('CLOUDFLARE_API_TOKEN')
  })

  it('api and backend docs describe raw-body public-key verification, deterministic workflow id, fresh URLs, streaming R2, participant roles, and sweep recovery', function () {
    const apiRoutes = readRepositoryFile('docs', 'system', 'system-design', 'api-routes.md')
    const backendDoc = readRepositoryFile('docs', 'infrastructure', 'backend.md')

    // raw-body public-key verification via well-known URL and rtk-signature
    expect(apiRoutes).toContain('POST /api/webhooks/realtimekit')
    expect(apiRoutes).toContain('rtk-signature')
    expect(backendDoc).toContain('REALTIMEKIT_WEBHOOK_PUBLIC_KEY_URL')
    expect(backendDoc).toContain('https://api.realtime.cloudflare.com/.well-known/webhooks.json')
    expect(apiRoutes + backendDoc).toMatch(/raw/i)

    // deterministic workflow instance per provider recording id
    expect(apiRoutes).toContain('recording_finalization')
    expect(apiRoutes + backendDoc).toMatch(/deterministic/i)

    // fresh short-lived download URLs fetched inside workflow, never persisted
    expect(apiRoutes + backendDoc).toMatch(/fresh/i)
    expect(apiRoutes + backendDoc).toMatch(/short-lived/i)

    // streaming to R2 without materializing full buffer
    expect(apiRoutes + backendDoc).toMatch(/stream/i)
    expect(backendDoc).toContain('RECORDINGS_BUCKET')

    // participant roles: composite playback vs participant tracks, candidate/peer mapping
    expect(apiRoutes + backendDoc).toMatch(/participant/i)
    expect(apiRoutes + backendDoc).toMatch(/composite/i)
    expect(apiRoutes + backendDoc).toMatch(/candidate/i)

    // sweep recovery for accepted/failed checkpoints via scheduled trigger
    expect(apiRoutes + backendDoc).toMatch(/sweep/i)
    expect(backendDoc).toContain('InterviewFeedbackWorkflow')
    expect(backendDoc).toContain('RecordingFinalizationWorkflow')
  })
})
