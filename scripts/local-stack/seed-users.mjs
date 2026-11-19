export const seedPassword = 'LocalDevPassw0rd!'
export const seedEmailDomain = 'mako.test'
export const premiumSlotMinutes = 60

export const seedUsers = [
  {
    role: 'learner',
    name: 'Local Learner',
    email: `learner@${seedEmailDomain}`,
    clientAddress: '10.20.0.1',
    isAdmin: false,
    companies: false,
    credits: 10,
  },
  {
    role: 'interviewer',
    name: 'Local Interviewer',
    email: `interviewer@${seedEmailDomain}`,
    clientAddress: '10.20.0.2',
    isAdmin: false,
    companies: false,
    credits: 0,
  },
  {
    role: 'verified-interviewer',
    name: 'Local Verified Interviewer',
    email: `verified@${seedEmailDomain}`,
    clientAddress: '10.20.0.3',
    isAdmin: false,
    companies: true,
    credits: 0,
  },
  {
    role: 'admin',
    name: 'Local Admin',
    email: `admin@${seedEmailDomain}`,
    clientAddress: '10.20.0.4',
    isAdmin: true,
    companies: false,
    credits: 0,
  },
]

export const premiumSlotOwnerEmail = `verified@${seedEmailDomain}`

const premiumSlotTemplates = [
  { id: '00000000-0000-4000-8000-0000000a0001', interviewType: 'coding', dayOffset: 1, hourUtc: 14 },
  { id: '00000000-0000-4000-8000-0000000a0002', interviewType: 'system_design', dayOffset: 1, hourUtc: 16 },
  { id: '00000000-0000-4000-8000-0000000a0003', interviewType: 'behavioral', dayOffset: 2, hourUtc: 14 },
]

export function buildPremiumSlots(now) {
  return premiumSlotTemplates.map(function toSlot(template) {
    const start = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + template.dayOffset,
        template.hourUtc,
      ),
    )
    const end = new Date(start.getTime() + premiumSlotMinutes * 60_000)

    return {
      id: template.id,
      interviewType: template.interviewType,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    }
  })
}
