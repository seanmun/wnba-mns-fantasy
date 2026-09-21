// Injury state carried by the NAME itself — red for Out, amber for
// day-to-day/questionable — because a phone row has no room for a
// badge. Screen readers still get the words via visually-hidden text;
// sighted color-blind users get luminance difference plus the title.
export function PlayerName({
  name,
  injuryStatus,
}: {
  name: string
  injuryStatus?: string | null
}) {
  if (!injuryStatus) return <>{name}</>
  const out = injuryStatus.toLowerCase() === 'out'
  return (
    <span
      style={{ color: out ? 'var(--color-pick-loss, #ff453a)' : 'var(--color-key, #ffb000)' }}
      title={injuryStatus}
    >
      {name}
      <span className="sr-only"> ({injuryStatus})</span>
    </span>
  )
}
