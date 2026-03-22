import { DangerZone } from '../../../components/settings/danger-zone'
import { ProfileDumb } from './profile-dumb'

export function ProfileSmart() {
  return <ProfileDumb dangerZone={<DangerZone />} />
}

export const Profile = ProfileSmart
