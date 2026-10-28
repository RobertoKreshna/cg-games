import type { Standings } from '@/types/game'

interface StandingsCardProps {
  standings: Standings
  /** Player id (individual) or team id (team) to highlight. */
  meId?: string | null
  limit?: number
}

export function StandingsCard({ standings, meId, limit = 5 }: StandingsCardProps) {
  const { entries, mode } = standings
  const myIndex = meId ? entries.findIndex((e) => e.id === meId) : -1
  const top = entries.slice(0, limit)
  const showMe = myIndex >= limit

  const row = (entry: (typeof entries)[number], rank: number) => (
    <div
      key={entry.id}
      className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm ${
        entry.id === meId ? 'bg-accent/15 border border-accent/60' : 'bg-white/5 border border-transparent'
      }`}
    >
      <span className="w-5 text-center text-faint text-xs font-bold tabular-nums">{rank}</span>
      {mode === 'team' && entry.color && (
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
      )}
      <span className="flex-1 font-bold truncate">
        {entry.name}
        {entry.id === meId && <span className="text-accent text-[10px] uppercase tracking-wider ml-2">Kamu</span>}
      </span>
      <span className="font-bold tabular-nums">{entry.points}</span>
    </div>
  )

  return (
    <section aria-label="Klasemen sementara" className="w-full max-w-xs flex flex-col gap-1.5">
      <p className="tag">
        Klasemen sementara{mode === 'team' && <span className="normal-case tracking-normal"> · rata-rata per anggota</span>}
      </p>
      {top.map((entry, i) => row(entry, i + 1))}
      {showMe && (
        <>
          <p className="text-faint text-center text-xs leading-none" aria-hidden>⋮</p>
          {row(entries[myIndex], myIndex + 1)}
        </>
      )}
    </section>
  )
}
