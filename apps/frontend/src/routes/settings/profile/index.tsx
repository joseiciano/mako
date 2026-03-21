import { createFileRoute } from '@tanstack/react-router'
import { ProfileSmart } from './profile-smart'

export const Route = createFileRoute('/settings/profile/')({
  component: ProfileSmart,
})
