import { ScanLine, MonitorX, RefreshCw } from "lucide-react";

/** Shown when the app is already open in another tab/window of this browser. */
export function LoggedInElsewhere() {
  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <header
        className="bg-primary text-white px-6 flex items-center shadow-md flex-shrink-0"
        style={{ minHeight: 52 }}
      >
        <div className="flex items-center gap-2">
          <ScanLine size={18} />
          <span className="text-sm font-bold tracking-tight uppercase">ProofX</span>
          <span className="text-white/30 mx-1">|</span>
          <span className="text-xs text-white/70 font-medium">Label proofing reading tool</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 bg-surface-2">
        <div className="w-full max-w-sm bg-white border border-border shadow-sm rounded-lg overflow-hidden">
          <div className="px-7 py-8 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <MonitorX className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-foreground mb-1.5">
              You're logged in elsewhere
            </h1>
            <p className="text-sm text-muted-foreground mb-6">
              ProofX is already open in another tab or window. Only one session can be
              active at a time. Close the other tab, then reload here to continue.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold bg-primary text-white transition-all hover:opacity-90"
            >
              <RefreshCw className="h-4 w-4" />
              Reload
            </button>
          </div>
        </div>
      </main>

      <footer className="py-5 text-center text-xs text-muted-foreground flex-shrink-0">
        ProofX · Label Compliance
      </footer>
    </div>
  );
}
