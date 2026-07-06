/** Shown instantly on navigation while the server renders the page. */
export default function Loading() {
  return (
    <div className="flex w-full animate-pulse flex-col">
      <div className="border-b border-sand px-5 py-5 lg:px-8 lg:py-6">
        <div className="h-7 w-44 rounded-lg bg-sand" />
        <div className="mt-2 h-4 w-64 rounded bg-sand/60" />
      </div>
      <div className="grid grid-cols-1 gap-5 px-5 py-5 lg:grid-cols-3 lg:px-8 lg:py-6">
        <div className="h-44 rounded-2xl bg-sand/50 lg:col-span-2" />
        <div className="h-44 rounded-2xl bg-sand/50" />
        <div className="h-24 rounded-2xl bg-sand/50" />
        <div className="h-24 rounded-2xl bg-sand/50" />
        <div className="h-40 rounded-2xl bg-sand/50 lg:col-span-2" />
        <div className="h-40 rounded-2xl bg-sand/50" />
      </div>
    </div>
  );
}
