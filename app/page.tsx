'use client'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  return (
    <main className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center text-center mb-12">
        <h1 className="text-5xl font-bold text-[#111] tracking-tight leading-none mb-3">
          CG Games
        </h1>
        <p className="text-[#999] text-sm">Game seru buat connect group</p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button onClick={() => router.push('/host')} className="btn-primary py-4 text-base w-full">
          Buat Room
        </button>
        <button onClick={() => router.push('/join')} className="btn-secondary py-4 text-base w-full">
          Gabung Room
        </button>
      </div>
    </main>
  )
}
