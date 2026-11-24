import { Link } from '@tanstack/react-router'
import type { AccountProfile, InterviewListItem } from '@mako/shared'
import { formatScheduledTime } from '#/lib/format-scheduled-time'
import '../../components/layout/redesign.css'
import { formatInterviewMode, selectCounterpartAlias } from './dashboard-dumb'

type DashboardRedesignProps = { account: AccountProfile; interviews: InterviewListItem[] }

function Stat(props: { n: number; label: string }) {
  return (
    <div className="rp-card">
      <div className="rp-n">{props.n}</div>
      <div className="mute">{props.label}</div>
    </div>
  )
}

export function DashboardRedesign(props: DashboardRedesignProps) {
  const { account, interviews } = props
  return (
    <>
      <h1 className="rp-title">
        Dashboard <span className="mute">/ overview</span>
      </h1>
      <div className="rp-grid rp-g4">
        <Stat n={account.credits} label="Credits" />
        <Stat n={account.freeStandardInterviews} label="Free peer left" />
        <Stat n={account.freeAiInterviews} label="Free AI left" />
        <Stat n={interviews.length} label="Upcoming" />
      </div>
      <div className="rp-card flush">
        <table className="rp-table">
          <thead>
            <tr><th>When</th><th>Mode</th><th>With</th><th /></tr>
          </thead>
          <tbody>
            {interviews.map((i) => (
              <tr key={i.id}>
                <td>{formatScheduledTime(i.scheduled_at)}</td>
                <td>{formatInterviewMode(i.mode)}</td>
                <td>{selectCounterpartAlias(account.id, i)}</td>
                <td><Link className="rp-btn g" to="/interviews/$id" params={{ id: i.id }}>Open</Link></td>
              </tr>
            ))}
            {interviews.length === 0 ? (
              <tr><td colSpan={4} className="mute">No upcoming interviews.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <Link className="rp-btn rp-cta" to="/interviews/new">Schedule an interview</Link>
    </>
  )
}
