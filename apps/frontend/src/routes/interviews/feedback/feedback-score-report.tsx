import type { InterviewFeedbackV1, RecordingStatus } from '@mako/shared'
import { formatScheduledTime } from '#/lib/format-scheduled-time'
import { scoreTier } from './feedback-report-helpers'
import { RecordingPlayer } from './recording-player'
import { ScreenshotGallery } from './screenshot-gallery'

export type FeedbackScoreReportProps = {
  feedback: InterviewFeedbackV1
  transcript: string | null
  recordingStatus: RecordingStatus
  recordingUrl: string | null
  screenshotUrls: string[]
  generatedAt: string | null
  promptVersion: string | null
}

export function FeedbackScoreReport(props: FeedbackScoreReportProps) {
  const { feedback } = props

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="text-lg font-semibold text-white">Overall score</h2>
        <p className="mt-1 text-xs text-slate-400">
          This is coaching feedback to help you grow — not a hire or no-hire decision.
        </p>
        <ScoreGauge label="Overall" score={feedback.overall_score} />
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
          {feedback.summary}
        </p>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="text-lg font-semibold text-white">Score breakdown</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <DimensionCard
            label="Communication"
            summary={feedback.dimensions.communication.summary}
            score={feedback.dimensions.communication.score}
          />
          <DimensionCard
            label="Problem solving"
            summary={feedback.dimensions.problem_solving.summary}
            score={feedback.dimensions.problem_solving.score}
          />
          <DimensionCard
            label="Technical depth"
            summary={feedback.dimensions.technical_depth.summary}
            score={feedback.dimensions.technical_depth.score}
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="text-lg font-semibold text-white">Strengths</h2>
        {feedback.strengths.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No specific strengths were called out.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {feedback.strengths.map(function mapStrength(strength) {
              return (
                <li className="rounded-lg border border-slate-800 bg-slate-950/70 p-3" key={strength.title}>
                  <h3 className="text-sm font-semibold text-emerald-200">{strength.title}</h3>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-300">
                    {strength.evidence}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="text-lg font-semibold text-white">Improvement actions</h2>
        {feedback.improvements.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No improvement actions were identified.</p>
        ) : (
          <ol className="mt-3 flex flex-col gap-3">
            {feedback.improvements.map(function mapImprovement(improvement, index) {
              return (
                <li className="rounded-lg border border-slate-800 bg-slate-950/70 p-3" key={improvement.title}>
                  <h3 className="text-sm font-semibold text-amber-200">
                    {index + 1}. {improvement.title}
                  </h3>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-300">
                    Evidence: {improvement.evidence}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-200">
                    Try: {improvement.action}
                  </p>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="text-lg font-semibold text-white">Recording</h2>
        <div className="mt-3">
          <RecordingPlayer recordingStatus={props.recordingStatus} recordingUrl={props.recordingUrl} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="text-lg font-semibold text-white">Whiteboard captures</h2>
        <div className="mt-3">
          <ScreenshotGallery screenshotUrls={props.screenshotUrls} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <details>
          <summary className="cursor-pointer text-lg font-semibold text-white">
            Transcript
          </summary>
          {props.transcript ? (
            <div className="mt-3 max-h-[32rem] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300">
              {props.transcript}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-400">Transcript is not available for this session.</p>
          )}
        </details>
      </section>

      <p className="text-xs text-slate-500">
        {formatReportMeta(props.generatedAt, props.promptVersion)}
      </p>
    </div>
  )
}

function ScoreGauge(props: { label: string; score: number }) {
  const tier = scoreTier(props.score)

  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-slate-400">{props.label}</span>
        <span className="text-3xl font-semibold text-white">
          {props.score}
          <span className="ml-1 text-sm font-normal text-slate-400">/ 100 · {tier.label}</span>
        </span>
      </div>
      <div aria-hidden="true" className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full ${tier.barClassName}`} style={{ width: `${props.score}%` }} />
      </div>
    </div>
  )
}

function DimensionCard(props: { label: string; score: number; summary: string }) {
  const tier = scoreTier(props.score)

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
      <h3 className="text-sm font-semibold text-white">{props.label}</h3>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-xl font-semibold text-white">{props.score}</span>
        <span className="text-xs text-slate-400">/ 100 · {tier.label}</span>
      </div>
      <div aria-hidden="true" className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full ${tier.barClassName}`} style={{ width: `${props.score}%` }} />
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-300">{props.summary}</p>
    </div>
  )
}

function formatReportMeta(generatedAt: string | null, promptVersion: string | null): string {
  const parts: string[] = []

  if (generatedAt) {
    parts.push(`Report generated ${formatScheduledTime(generatedAt)}`)
  }
  if (promptVersion) {
    parts.push(`Prompt version ${promptVersion}`)
  }

  return parts.length > 0 ? parts.join(' · ') : 'Report generation details are unavailable.'
}
