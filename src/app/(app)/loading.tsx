export default function Loading() {
  return (
    <div className="animate-fade-in-late" aria-busy="true" aria-label="Memuat">
      <div className="animate-pulse">
        <div className="mb-3 h-8 w-56 rounded-lg bg-surface-2" />
        <div className="mb-8 h-4 w-80 max-w-full rounded bg-surface-2" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-24" />
          ))}
        </div>
      </div>
    </div>
  );
}
