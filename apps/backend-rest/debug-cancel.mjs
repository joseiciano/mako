import { createApp } from './src/index.ts'

async function test() {
  const app = createApp()
  
  const createResponse = await app.request('/api/interviews', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'system_design', mode: 'ai_led', scheduled_at: 'now' }),
  })
  
  const createdInterview = await createResponse.json()
  
  const cancelResponse = await app.request(`/api/interviews/${createdInterview.interview.id}/cancel`, {
    method: 'POST',
  })
  
  console.log('cancel status:', cancelResponse.status)
  console.log('cancel body:', await cancelResponse.json())
}

test().catch(console.error)
