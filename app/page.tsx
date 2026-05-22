'use client'
import { useRouter } from 'next/navigation'

const GAMES = [
  { emoji: '📖', name: 'Bible Quiz' },
  { emoji: '📝', name: 'Verse Scramble' },
  { emoji: '🎭', name: 'Emoji Story' },
]

export default function Home() {
  const router = useRouter()
  return (
    <main className="app-bg grid-bg min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[280px] rounded-full bg-violet-700/20 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-72 h-72 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center text-center mb-10">
        <div
          className="text-5xl mb-5 drop-shadow-[0_0_24px_rgba(245,184,0,0.6)]"
          style={{ filter: 'drop-shadow(0 0 16px rgba(245,184,0,0.5))' }}
        >
          ✝
        </div>
        <h1 className="heading text-6xl text-white leading-none mb-2">
          CG<span className="text-gold">Games</span>
        </h1>
        <p className="text-white/35 text-xs tracking-[0.18em] uppercase mt-2">
          Connect Group · In-Person
        </p>
      </div>

      <div className="relative z-10 flex flex-col gap-3 w-full max-w-xs mb-10">
        <button onClick={() => router.push('/host')} className="btn-primary py-4 text-lg w-full">
          Buat Room
        </button>
        <button onClick={() => router.push('/join')} className="btn-glass py-4 text-lg w-full">
          Gabung Room
        </button>
      </div>

      <div className="relative z-10 flex gap-2 w-full max-w-xs">
        {GAMES.map((g) => (
          <div key={g.name} className="glass-card-sm flex-1 p-3 flex flex-col items-center gap-1.5">
            <span className="text-xl">{g.emoji}</span>
            <span className="text-white/55 text-xs font-semibold text-center leading-tight">{g.name}</span>
          </div>
        ))}
      </div>
    </main>
  )
}
