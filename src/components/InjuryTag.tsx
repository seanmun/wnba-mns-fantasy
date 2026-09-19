// The injury report in two letters: red OUT, amber DTD (or the raw
// status ESPN gives). Sits inline after a player's name everywhere
// rosters render.
export function InjuryTag({ status }: { status?: string | null }) {
  if (!status) return null
  const out = status.toLowerCase() === 'out'
  return (
    <span
      className="ml-1.5 align-middle text-[0.62rem] font-bold uppercase tracking-wide rounded px-1 py-0.5"
      style={{
        color: out ? 'var(--color-pick-loss, #ff453a)' : 'var(--color-key, #ffb000)',
        border: `1px solid ${out ? 'var(--color-pick-loss, #ff453a)' : 'var(--color-key, #ffb000)'}`,
      }}
    >
      {out ? 'OUT' : status === 'Day-To-Day' ? 'DTD' : status}
    </span>
  )
}
