import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { RecordingPlayer } from './recording-player'

describe('RecordingPlayer', function suite() {
  it('shows an unavailable message when recording never started', function run() {
    render(<RecordingPlayer recordingStatus="not_started" recordingUrl={null} />)
    expect(screen.getByText(/no recording is available/i)).toBeInTheDocument()
  })

  it('shows a processing status while the recording is not ready', function run() {
    render(<RecordingPlayer recordingStatus="processing" recordingUrl={null} />)
    expect(screen.getByRole('status')).toHaveTextContent(/still processing/i)
  })

  it('shows a failure alert when recording processing failed', function run() {
    render(<RecordingPlayer recordingStatus="failed" recordingUrl={null} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't process/i)
  })

  it('shows an expired message when ready but the URL has expired', function run() {
    render(<RecordingPlayer recordingStatus="ready" recordingUrl={null} />)
    expect(screen.getByText(/no longer available/i)).toBeInTheDocument()
    expect(screen.getByText(/30 days/i)).toBeInTheDocument()
  })

  it('renders an accessible, credentialed video element when ready', function run() {
    render(
      <RecordingPlayer
        recordingStatus="ready"
        recordingUrl="https://api.test.local/api/interviews/1/artifacts/recording"
      />,
    )
    const video = screen.getByLabelText(/interview session recording/i)
    expect(video.tagName).toBe('VIDEO')
    expect(video).toHaveAttribute('controls')
    expect(video).toHaveAttribute('crossorigin', 'use-credentials')
    expect(video).toHaveAttribute(
      'src',
      'https://api.test.local/api/interviews/1/artifacts/recording',
    )
  })

  it('shows a playback failure message when the video element errors', function run() {
    render(
      <RecordingPlayer
        recordingStatus="ready"
        recordingUrl="https://api.test.local/api/interviews/1/artifacts/recording"
      />,
    )
    const video = screen.getByLabelText(/interview session recording/i)
    fireEvent.error(video)
    expect(screen.getByRole('alert')).toHaveTextContent(/playback failed/i)
  })
})
