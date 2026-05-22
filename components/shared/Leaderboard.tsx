import type { LeaderboardEntry, RoomMode } from '@/types/game'

interface LeaderboardProps {
  entries: LeaderboardEntry[]
  mode: RoomMode
}

const MEDALS = ['🥇', '🥈', '🥉']

const RANK_BG = [
  { bg: 'rgba(245,184,0,0.14)', border: 'rgba(245,184,0,0.35)' },
  { bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.28)' },
  { bg: 'rgba(180,100,50,0.12)', border: 'rgba(180,100,50,0.28)' },
]

export function Leaderboard({ entries, mode }: LeaderboardProps) {
  return (
    <div className="flex flex-col gap-2 w-full max-w-md mx-auto">
      {entries.map((entry, i) => {
        const rank = RANK_BG[i]
        return (
          <div
            key={entry.playerId ?? entry.teamId}
            className="flex items-center gap-3 rounded-2xl p-4 text-white"
            style={
              rank
                ? { background: rank.bg, border: `1px solid ${rank.border}` }
                : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }
            }
          >
            <span className="text-2xl w-8 text-center shrink-0">
              {i < 3 ? MEDALS[i] : <span className="text-white/30 text-sm font-bold">{i + 1}</span>}
            </span>
            {mode === 'team' && entry.teamColor && (
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.teamColor }} />
            )}
            <span className="flex-1 font-semibold text-sm">{entry.playerName ?? entry.teamName}</span>
            <span
              className="font-black text-base shrink-0"
              style={{ color: i === 0 ? '#f5b800' : 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-syne)' }}
            >
              {entry.totalPoints ?? 0}
              <span className="text-xs font-normal opacity-50 ml-0.5">pts</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
