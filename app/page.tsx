'use client'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-linear-to-br from-blue-600 to-purple-700 p-6">
      <h1 className="text-5xl font-bold text-white mb-2">CG Games</h1>
      <p className="text-blue-100 mb-14 text-lg">Game seru buat connect group 🎮</p>
      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button
          onClick={() => router.push('/host')}
          className="bg-white text-blue-700 font-bold py-4 rounded-2xl text-lg shadow-xl active:scale-95 transition-transform"
        >
          Buat Room
        </button>
        <button
          onClick={() => router.push('/join')}
          className="bg-blue-500 text-white font-bold py-4 rounded-2xl text-lg border-2 border-white/30 active:scale-95 transition-transform"
        >
          Gabung Room
        </button>
      </div>
    </main>
  )
}
