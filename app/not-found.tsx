import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="card p-8 flex flex-col items-center gap-4 text-center max-w-xs w-full animate-pop-in">
        <div aria-hidden className="flex gap-2 text-2xl">
          <span style={{ color: '#FF6B81' }}>▲</span>
          <span style={{ color: '#38BDF8' }}>◆</span>
          <span style={{ color: '#FFD43B' }}>●</span>
          <span style={{ color: '#4ADE80' }}>■</span>
        </div>
        <h1 className="font-display text-3xl font-semibold">Halaman tidak ditemukan</h1>
        <p className="text-mist text-sm font-semibold">
          Link-nya mungkin salah atau room sudah ditutup. Coba masukkan kode room lagi.
        </p>
        <Link href="/join" className="btn-primary py-3.5 text-base w-full">Gabung Room</Link>
        <Link href="/" className="btn-secondary py-3 text-sm w-full">Kembali ke Home</Link>
      </div>
    </main>
  )
}
