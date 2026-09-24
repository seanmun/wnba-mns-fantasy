import { Button } from '../ui/components'

// Bump's dials: six sliders and a philosophy line, saved as the team's
// ai_prefs. One component, so Team Settings and the desktop Bump panel
// can never disagree about what a dial means.
const DIALS = [
  ['timeline', 'Rebuilding', 'Win now'],
  ['spending', 'Cap-frugal', 'Spend to the apron'],
  ['rosterShape', 'Balanced', 'Specialists (punt)'],
  ['assetTaste', 'Picks & prospects', 'Proven veterans'],
  ['risk', 'Safe floors', 'Upside swings'],
  ['activity', 'Set & forget', 'Daily grinder'],
] as const

export function StrategyDials({
  value,
  onChange,
  dirty,
  onSave,
  saving,
  compact = false,
}: {
  value: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  dirty: boolean
  onSave: () => void
  saving: boolean
  /** Tighter rows for the docked panel, where height is the budget. */
  compact?: boolean
}) {
  return (
    <div className={compact ? 'flex flex-col gap-1.5' : 'flex flex-col gap-3'}>
      {DIALS.map(([k, left, right]) => (
        <label key={k} className="block">
          <span className="flex justify-between text-xs text-[var(--color-muted-foreground)] mb-0.5">
            <span>{left}</span>
            <span>{right}</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Number(value[k] ?? 50)}
            onChange={(e) => onChange({ ...value, [k]: Number(e.target.value) })}
            className="w-full accent-[var(--color-accent)]"
            aria-label={`${left} to ${right}`}
          />
        </label>
      ))}
      <label className="block">
        <span className="block text-xs text-[var(--color-muted-foreground)] mb-1">
          Your philosophy, in your words — this outranks the dials
        </span>
        <textarea
          value={String(value.notes ?? '')}
          maxLength={600}
          rows={compact ? 2 : 3}
          placeholder={'e.g. "Never trade my 2027 firsts. I punt FT%. Prefer two-way wings."'}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          className="w-full px-3 py-2 rounded-lg bg-[var(--color-background)] border border-[var(--color-border-interactive)] text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:border-[var(--color-accent)]"
        />
      </label>
      {dirty ? (
        <Button onClick={onSave} disabled={saving}>
          Save strategy
        </Button>
      ) : null}
    </div>
  )
}
