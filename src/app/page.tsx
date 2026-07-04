export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-bold">Bounce App</h1>
      <p className="text-lg text-gray-600">
        Next.js 14 · App Router · TypeScript · Tailwind CSS
      </p>
      <a
        href="/api/health"
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80"
      >
        Check API health
      </a>
    </main>
  );
}
