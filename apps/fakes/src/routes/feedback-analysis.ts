import { jsonResponse } from '../http.ts'

/** Canned report that satisfies `interviewFeedbackV1Schema` (schema_version 1). */
export const FAKE_FEEDBACK_REPORT = {
  schema_version: 1,
  overall_score: 72,
  summary: 'Canned local feedback: a clear approach with room to go deeper on trade-offs.',
  dimensions: {
    communication: { score: 75, summary: 'Explained the approach in a clear order.' },
    problem_solving: { score: 70, summary: 'Broke the problem into workable parts.' },
    technical_depth: { score: 68, summary: 'Covered the basics; edge cases need more depth.' },
  },
  strengths: [
    { title: 'Clear structure', evidence: 'Stated the plan before starting the design.' },
  ],
  improvements: [
    {
      title: 'Name trade-offs',
      evidence: 'Chose a data store without comparing options.',
      action: 'State two alternatives and why you did not pick them.',
    },
  ],
}

export const handleFeedbackAnalysis = (): Response =>
  jsonResponse({
    success: true,
    result: {
      choices: [{ message: { role: 'assistant', content: JSON.stringify(FAKE_FEEDBACK_REPORT) } }],
    },
  })
