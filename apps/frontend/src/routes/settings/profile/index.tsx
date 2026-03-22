import { createFileRoute } from '@tanstack/react-router'
import { Profile } from './profile-smart'

export const Route = createFileRoute('/settings/profile/')({
  component: Profile,
})
