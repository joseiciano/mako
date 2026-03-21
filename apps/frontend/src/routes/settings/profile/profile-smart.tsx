import { DangerZone } from '../../../components/settings/danger-zone'
import { ProfileDumb } from './profile-dumb'

export function Profile() {
  return <ProfileDumb dangerZone={<DangerZone />} />
}
