export const FAKE_TRANSCRIPT_TEXT =
  'Canned local transcript. The candidate described the approach and discussed trade-offs.'

/** Whisper-shaped result for `env.AI.run(...)`; any other model gets a text response. */
export function fakeAiRun(model: string): Record<string, unknown> {
  console.log(`[fakes-ai] run ${model}`)
  if (model.includes('whisper')) {
    return { text: FAKE_TRANSCRIPT_TEXT }
  }
  return { response: FAKE_TRANSCRIPT_TEXT }
}
