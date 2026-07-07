'use client'
import { useRouter } from 'next/navigation'

const SHAPES = [
  { char: '▲', color: '#FB7185', top: '10%', left: '10%', size: '2rem', tilt: '-14deg', delay: '0s' },
  { char: '◆', color: '#60A5FA', top: '18%', right: '12%', size: '1.6rem', tilt: '10deg', delay: '-1.4s' },
  { char: '●', color: '#FFC700', bottom: '24%', left: '14%', size: '1.4rem', tilt: '0deg', delay: '-2.6s' },
  { char: '■', color: '#4ADE80', bottom: '14%', right: '14%', size: '1.7rem', tilt: '16deg', delay: '-3.8s' },
  { char: '✦', color: '#C4B5FD', top: '38%', left: '4%', size: '1.1rem', tilt: '0deg', delay: '-2s' },
  { char: '✦', color: '#F0ABFC', top: '30%', right: '5%', size: '0.9rem', tilt: '0deg', delay: '-0.8s' },
]

const GAMES = [
  { emoji: '📖', label: 'Bible Quiz' },
  { emoji: '📝', label: 'Verse Scramble' },
  { emoji: '🎭', label: 'Emoji Story' },
]

export default function Home() {
  const router = useRouter()
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        {SHAPES.map((s, i) => (
          <span
            key={i}
            className="absolute animate-float select-none"
            style={{
              top: s.top, left: s.left, right: s.right, bottom: s.bottom,
              color: s.color, fontSize: s.size, opacity: 0.35,
              animationDelay: s.delay, '--tilt': s.tilt,
            } as React.CSSProperties}
          >
            {s.char}
          </span>
        ))}
      </div>

      <div className="flex flex-col items-center text-center mb-10 relative">
        <div className="flex gap-2 text-xl mb-4" aria-hidden>
          <span style={{ color: '#FB7185' }}>▲</span>
          <span style={{ color: '#60A5FA' }}>◆</span>
          <span style={{ color: '#FFC700' }}>●</span>
          <span style={{ color: '#4ADE80' }}>■</span>
        </div>
        <h1 className="font-display text-6xl font-semibold tracking-tight leading-none mb-3">
          CG <span className="text-gold">Games</span>
        </h1>
        <p className="text-mist text-base font-semibold">Game seru buat connect group 🎉</p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-xs relative">
        <button onClick={() => router.push('/host')} className="btn-primary py-4 text-lg w-full">
          Buat Room
        </button>
        <button onClick={() => router.push('/join')} className="btn-secondary py-4 text-lg w-full">
          Gabung Room
        </button>
      </div>

      <div className="flex gap-2 mt-10 relative">
        {GAMES.map((g) => (
          <span key={g.label} className="bg-white/5 border border-line rounded-full px-3 py-1.5 text-xs font-bold text-mist">
            {g.emoji} {g.label}
          </span>
        ))}
      </div>
    </main>
  )
}
