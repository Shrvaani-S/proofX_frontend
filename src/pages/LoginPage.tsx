import { useState, type FormEvent } from "react";
import { ScanLine, Lock, Loader2 } from "lucide-react";
import { login } from "@/lib/api";

interface Props {
  onSuccess: () => void;
}

export function LoginPage({ onSuccess }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
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

      {/* Body */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 bg-surface-2">
        <div className="w-full max-w-sm bg-white border border-border shadow-sm rounded-lg overflow-hidden">
          <div className="px-7 pt-7 pb-6">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Lock className="h-4 w-4 text-primary" />
              </div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">Sign in</h1>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Enter your credentials to access ProofX.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-xs font-semibold text-foreground/80">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder="you@example.com"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-xs font-semibold text-foreground/80">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold bg-primary text-white transition-all hover:opacity-90 disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-5 text-center text-xs text-muted-foreground flex-shrink-0">
        ProofX · Label Compliance
      </footer>
    </div>
  );
}
