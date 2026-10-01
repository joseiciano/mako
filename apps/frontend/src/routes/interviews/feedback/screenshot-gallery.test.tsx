import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScreenshotGallery } from './screenshot-gallery'

describe('ScreenshotGallery', function suite() {
  it('shows an empty-state message when there are no screenshots', function run() {
    render(<ScreenshotGallery screenshotUrls={[]} />)
    expect(screen.getByText(/no whiteboard captures/i)).toBeInTheDocument()
  })

  it('renders each screenshot with meaningful alt text and lazy loading below the fold', function run() {
    render(
      <ScreenshotGallery
        screenshotUrls={[
          'https://api.test.local/api/interviews/1/artifacts/screenshots/a',
          'https://api.test.local/api/interviews/1/artifacts/screenshots/b',
        ]}
      />,
    )

    const first = screen.getByAltText('Whiteboard capture 1 of 2 from the interview')
    const second = screen.getByAltText('Whiteboard capture 2 of 2 from the interview')

    expect(first).toHaveAttribute('loading', 'eager')
    expect(second).toHaveAttribute('loading', 'lazy')
    expect(first).toHaveAttribute('crossorigin', 'use-credentials')
  })

  it('opens an expanded view when a screenshot is activated', async function run() {
    const user = userEvent.setup()
    render(
      <ScreenshotGallery
        screenshotUrls={['https://api.test.local/api/interviews/1/artifacts/screenshots/a']}
      />,
    )

    await user.click(screen.getByAltText('Whiteboard capture 1 of 1 from the interview'))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByAltText('Expanded whiteboard capture 1 of 1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows a per-image failure state without affecting other images', function run() {
    render(
      <ScreenshotGallery
        screenshotUrls={[
          'https://api.test.local/api/interviews/1/artifacts/screenshots/a',
          'https://api.test.local/api/interviews/1/artifacts/screenshots/b',
        ]}
      />,
    )

    const failingImage = screen.getByAltText('Whiteboard capture 1 of 2 from the interview')
    fireEvent.error(failingImage)

    expect(screen.getByRole('img', { name: /failed to load/i })).toBeInTheDocument()
    expect(screen.getByAltText('Whiteboard capture 2 of 2 from the interview')).toBeInTheDocument()
  })
})
