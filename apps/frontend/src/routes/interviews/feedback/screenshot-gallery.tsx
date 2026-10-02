import { useState } from 'react'

export type ScreenshotGalleryProps = {
  screenshotUrls: string[]
}

export function ScreenshotGallery(props: ScreenshotGalleryProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [failedIndexes, setFailedIndexes] = useState<ReadonlySet<number>>(new Set())

  if (props.screenshotUrls.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        No whiteboard captures are available for this session.
      </p>
    )
  }

  const total = props.screenshotUrls.length

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="list">
        {props.screenshotUrls.map(function mapScreenshot(url, index) {
          const altText = `Whiteboard capture ${index + 1} of ${total} from the interview`

          if (failedIndexes.has(index)) {
            return (
              <li key={url}>
                <div
                  aria-label={`${altText} failed to load`}
                  className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/60 text-xs text-slate-500"
                  role="img"
                >
                  Unavailable
                </div>
              </li>
            )
          }

          return (
            <li key={url}>
              <button
                className="block w-full overflow-hidden rounded-lg border border-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                onClick={function openExpandedView() {
                  setExpandedIndex(index)
                }}
                type="button"
              >
                <img
                  alt={altText}
                  className="aspect-video w-full object-cover"
                  crossOrigin="use-credentials"
                  loading={index === 0 ? 'eager' : 'lazy'}
                  onError={function handleImageError() {
                    setFailedIndexes(function markFailed(current) {
                      return new Set(current).add(index)
                    })
                  }}
                  src={url}
                />
              </button>
            </li>
          )
        })}
      </ul>

      {expandedIndex !== null ? (
        <ExpandedScreenshot
          altText={`Expanded whiteboard capture ${expandedIndex + 1} of ${total}`}
          onClose={function closeExpandedView() {
            setExpandedIndex(null)
          }}
          url={props.screenshotUrls[expandedIndex] ?? ''}
        />
      ) : null}
    </>
  )
}

function ExpandedScreenshot(props: { url: string; altText: string; onClose: () => void }) {
  return (
    <div
      aria-label={props.altText}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
      onKeyDown={function handleKeyDown(event) {
        if (event.key === 'Escape') {
          props.onClose()
        }
      }}
      role="dialog"
    >
      <div className="relative max-h-full max-w-4xl">
        <img
          alt={props.altText}
          className="max-h-[85vh] w-full rounded-lg object-contain"
          crossOrigin="use-credentials"
          src={props.url}
        />
        <button
          autoFocus
          className="absolute right-2 top-2 rounded-md bg-slate-900/80 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          onClick={props.onClose}
          type="button"
        >
          Close
        </button>
      </div>
    </div>
  )
}
