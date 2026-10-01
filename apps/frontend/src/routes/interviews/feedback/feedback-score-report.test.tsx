import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { InterviewFeedbackV1 } from '@mako/shared'
import { FeedbackScoreReport } from './feedback-score-report'

function makeFeedback(overrides?: Partial<InterviewFeedbackV1>): InterviewFeedbackV1 {
  return {
    schema_version: 1,
    overall_score: 82,
    summary: 'Solid overall performance with room to grow on timing.',
    dimensions: {
      communication: { score: 90, summary: 'Clear and concise.' },
      problem_solving: { score: 78, summary: 'Methodical approach.' },
      technical_depth: { score: 80, summary: 'Good depth of knowledge.' },
    },
    strengths: [{ title: 'Clear communication', evidence: 'Explained tradeoffs clearly.' }],
    improvements: [
      {
        title: 'Time management',
        evidence: 'Ran out of time on the last section.',
        action: 'Practice timeboxing each section.',
      },
    ],
    ...overrides,
  }
}

describe('FeedbackScoreReport', function suite() {
  it('renders the overall score, summary, and coaching framing', function run() {
    render(
      <FeedbackScoreReport
        feedback={makeFeedback()}
        generatedAt="2026-04-13T11:05:00.000Z"
        promptVersion="feedback-v1-2026-04-01"
        recordingStatus="not_started"
        recordingUrl={null}
        screenshotUrls={[]}
        transcript={null}
      />,
    )

    expect(screen.getByText('82')).toBeInTheDocument()
    expect(screen.getByText(/room to grow on timing/i)).toBeInTheDocument()
    expect(screen.getByText(/not a hire or no-hire decision/i)).toBeInTheDocument()
  })

  it('renders every score dimension with a non-color-only label', function run() {
    render(
      <FeedbackScoreReport
        feedback={makeFeedback()}
        generatedAt={null}
        promptVersion={null}
        recordingStatus="not_started"
        recordingUrl={null}
        screenshotUrls={[]}
        transcript={null}
      />,
    )

    expect(screen.getByText('Communication')).toBeInTheDocument()
    expect(screen.getByText('Problem solving')).toBeInTheDocument()
    expect(screen.getByText('Technical depth')).toBeInTheDocument()
    expect(screen.getAllByText(/Strong|Solid|Developing|Needs focus/).length).toBeGreaterThan(0)
  })

  it('renders evidence-backed strengths and prioritized improvements', function run() {
    render(
      <FeedbackScoreReport
        feedback={makeFeedback()}
        generatedAt={null}
        promptVersion={null}
        recordingStatus="not_started"
        recordingUrl={null}
        screenshotUrls={[]}
        transcript={null}
      />,
    )

    expect(screen.getByText('Clear communication')).toBeInTheDocument()
    expect(screen.getByText('Explained tradeoffs clearly.')).toBeInTheDocument()
    expect(screen.getByText(/1\. Time management/)).toBeInTheDocument()
    expect(screen.getByText(/Practice timeboxing/)).toBeInTheDocument()
  })

  it('renders the transcript collapsibly and preserves line breaks as text, not markup', function run() {
    render(
      <FeedbackScoreReport
        feedback={makeFeedback()}
        generatedAt={null}
        promptVersion={null}
        recordingStatus="not_started"
        recordingUrl={null}
        screenshotUrls={[]}
        transcript={'Line one\nLine two <script>window.x = 1</script>'}
      />,
    )

    expect(screen.getByText('Transcript')).toBeInTheDocument()
    expect(document.querySelector('script[src]')).toBeNull()
    expect(screen.getByText(/Line one/)).toBeInTheDocument()
    expect(document.body.textContent).toContain('<script>')
  })

  it('shows a transcript-unavailable message when transcript is null', function run() {
    render(
      <FeedbackScoreReport
        feedback={makeFeedback()}
        generatedAt={null}
        promptVersion={null}
        recordingStatus="not_started"
        recordingUrl={null}
        screenshotUrls={[]}
        transcript={null}
      />,
    )

    expect(screen.getByText(/transcript is not available/i)).toBeInTheDocument()
  })

  it('renders the report generation timestamp and prompt version', function run() {
    render(
      <FeedbackScoreReport
        feedback={makeFeedback()}
        generatedAt="2026-04-13T11:05:00.000Z"
        promptVersion="feedback-v1-2026-04-01"
        recordingStatus="not_started"
        recordingUrl={null}
        screenshotUrls={[]}
        transcript={null}
      />,
    )

    expect(screen.getByText(/report generated/i)).toBeInTheDocument()
    expect(screen.getByText(/feedback-v1-2026-04-01/)).toBeInTheDocument()
  })
})
