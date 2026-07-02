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
          className="flex items-center gap-3 rounded-2xl p-4 bg-white border border-[#E8E8E8]"
        >
          <span className="w-8 text-center shrink-0">
            {i < 3
              ? <span className="text-xl">{MEDALS[i]}</span>
              : <span className="text-[#CCC] text-sm font-semibold">{i + 1}</span>
            }
          </span>
          {mode === 'team' && entry.teamColor && (
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.teamColor }} />
          )}
          <span className="flex-1 text-[#111] font-medium text-sm">{entry.playerName ?? entry.teamName}</span>
          <span className="text-[#111] font-bold text-sm shrink-0">
            {entry.totalPoints ?? 0}
            <span className="text-[#999] font-normal text-xs ml-0.5">pts</span>
          </span>
        </div>
      ))}
    </div>
  )
}
