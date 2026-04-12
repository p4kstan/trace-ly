export function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in p-6">
      <div className="space-y-2">
        <div className="h-7 w-48 bg-muted/40 rounded-lg animate-pulse" />
        <div className="h-4 w-72 bg-muted/20 rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-muted/30 rounded-xl animate-pulse" />
        ))}
      </div>
      <div className="h-64 bg-muted/20 rounded-xl animate-pulse" />
    </div>
  );
}
