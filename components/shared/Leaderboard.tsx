import type { LeaderboardEntry, RoomMode } from '@/types/game'

interface LeaderboardProps {
  entries: LeaderboardEntry[]
  mode: RoomMode
  /** Player id (individual) or team id (team) to highlight. */
  meId?: string | null
}

const PODIUM = [
  { medal: '🥇', accent: 'border-accent bg-accent/10' },
  { medal: '🥈', accent: 'border-[#C0C0C0]/50 bg-white/5' },
  { medal: '🥉', accent: 'border-[#CD7F32]/50 bg-[#CD7F32]/10' },
]

export function Leaderboard({ entries, mode, meId }: LeaderboardProps) {
  return (
    <div className="flex flex-col gap-2 w-full max-w-md mx-auto">
      {entries.map((entry, i) => {
        const podium = i < 3 ? PODIUM[i] : null
        const isMe = !!meId && (entry.playerId ?? entry.teamId) === meId
        return (
          <div
            key={entry.playerId ?? entry.teamId}
            className={`animate-pop-in flex items-center gap-3 rounded-2xl p-4 border ${
              podium ? podium.accent : 'bg-surface border-line'
            } ${i === 0 ? 'py-5' : ''} ${isMe ? 'ring-2 ring-accent' : ''}`}
            style={{ animationDelay: `${Math.min(i, 10) * 70}ms` }}
          >
            <span className="w-8 text-center shrink-0">
              {podium
                ? <span className={i === 0 ? 'text-3xl' : 'text-xl'}>{podium.medal}</span>
                : <span className="text-faint text-sm font-bold tabular-nums">{i + 1}</span>
              }
            </span>
            {mode === 'team' && entry.teamColor && (
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.teamColor }} />
            )}
            <span className={`flex-1 font-bold ${i === 0 ? 'font-display text-lg font-semibold' : 'text-sm'}`}>
              {entry.playerName ?? entry.teamName}
              {isMe && <span className="text-accent text-[10px] font-bold uppercase tracking-wider ml-2">Kamu</span>}
            </span>
            <span className={`font-bold shrink-0 tabular-nums ${i === 0 ? 'text-accent text-lg' : 'text-sm'}`}>
              {entry.totalPoints ?? 0}
              <span className="text-faint font-semibold text-xs ml-0.5">pts</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
