type RemoteVideoParticipant = {
  videoEnabled?: boolean
  videoTrack?: MediaStreamTrack | null
}

type JoinedParticipantCollection = {
  values: () => Iterable<RemoteVideoParticipant>
}

export function getFirstRemoteVideoTrack(
  joinedParticipants: unknown,
): MediaStreamTrack | null {
  if (!hasParticipantValues(joinedParticipants)) return null

  const participant = Array.from(joinedParticipants.values()).find(
    (value) => value.videoTrack,
  )

  if (!participant?.videoEnabled) return null
  return participant.videoTrack ?? null
}

function hasParticipantValues(
  value: unknown,
): value is JoinedParticipantCollection {
  return (
    typeof value === 'object' &&
    value !== null &&
    'values' in value &&
    typeof value.values === 'function'
  )
}
