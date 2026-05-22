import type { LeaderboardEntry, RoomMode } from '@/types/game'

interface LeaderboardProps {
  entries: LeaderboardEntry[]
  mode: RoomMode
}

const MEDALS = ['🥇', '🥈', '🥉']

export function Leaderboard({ entries, mode }: LeaderboardProps) {
  return (
    <div className="flex flex-col gap-2 w-full max-w-md mx-auto">
      {entries.map((entry, i) => (
        <div
          key={entry.playerId ?? entry.teamId}
          className="flex items-center gap-3 bg-white/10 rounded-2xl p-3 text-white"
        >
          <span className="text-2xl w-8 text-center font-bold">
            {MEDALS[i] ?? `${i + 1}`}
          </span>
          {mode === 'team' && entry.teamColor && (
            <div
              className="w-4 h-4 rounded-full flex-shrink-0"
              style={{ backgroundColor: entry.teamColor }}
            />
          )}
          <span className="flex-1 font-semibold">{entry.playerName ?? entry.teamName}</span>
          <span className="font-bold text-yellow-300">{entry.totalPoints ?? 0} pts</span>
        </div>
      ))}
    </div>
  )
}
