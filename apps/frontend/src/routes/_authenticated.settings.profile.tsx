import { createFileRoute } from '@tanstack/react-router'
import { Profile } from './settings/profile/profile-smart'

export const Route = createFileRoute('/_authenticated/settings/profile')({
  component: Profile,
})
