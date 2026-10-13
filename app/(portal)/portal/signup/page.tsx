"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { FloatingOrb } from "@/components/orb/FloatingOrb";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { Field, inputClass } from "@/components/portal/ui";
import { api, ApiError, isWorkspaceEmail, WORKSPACE_EMAIL_DOMAIN, type SignupAvailability } from "@/lib/api";

export default function SignupPage() {
  const { signup } = useAuth();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [reachError, setReachError] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .get<SignupAvailability>("/auth/signup-available")
      .then((r) => {
        setAvailable(r.available);
        setReachError(false);
      })
      // A network/CORS failure is NOT "signups closed" — surface it honestly.
      .catch(() => setReachError(true));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isWorkspaceEmail(email)) {
      setError(`Use your @${WORKSPACE_EMAIL_DOMAIN} work email.`);
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      await signup(name, email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create account. Is the API running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grain relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <FloatingOrb size="min(60vw, 680px)" variant="hero" speed={18} interactive parallax={40} className="-right-32 top-1/4" opacity={0.8} />

      <Link
        href="/portal/login"
        className="absolute left-6 top-6 z-10 flex items-center gap-2 text-sm font-light text-secondary transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to sign in
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20, filter: "blur(12px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="glass-strong relative z-10 w-full max-w-md rounded-3xl p-9"
      >
        <div className="mb-8 flex items-center gap-3">
          <Logo size={32} />
          <div>
            <p className="text-sm font-medium tracking-tight">Project O2</p>
            <p className="text-[11px] tracking-eyebrow text-ink-40">Finance Platform</p>
          </div>
        </div>

        {reachError ? (
          <>
            <h1 className="text-3xl font-extralight tracking-tight">Can&apos;t reach the server</h1>
            <p className="mt-3 text-sm font-light text-secondary">
              The app couldn&apos;t connect to the API. This usually means the API URL is
              misconfigured. Please try again shortly.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-8 w-full rounded-full bg-foreground py-3 text-sm font-medium text-background"
            >
              Retry
            </button>
          </>
        ) : available === false ? (
          <>
            <h1 className="text-3xl font-extralight tracking-tight">Signups are closed</h1>
            <p className="mt-3 text-sm font-light text-secondary">
              This workspace already has an administrator. Ask them to invite you — you&apos;ll
              receive an email with a link to set your password.
            </p>
            <Link href="/portal/login">
              <Button size="lg" className="mt-8 w-full" magnetic={false}>
                Go to sign in <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-extralight tracking-tight">Create your workspace</h1>
            <p className="mt-2 text-sm font-light text-secondary">
              The first account becomes the Admin / CEO. You&apos;ll invite your team next.
            </p>

            <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5">
              <Field label="Full name">
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Aarav Khanna"
                  className={inputClass}
                />
              </Field>
              <Field label="Work email">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={`you@${WORKSPACE_EMAIL_DOMAIN}`}
                  className={inputClass}
                />
                <span className="mt-1 text-[11px] text-ink-40">
                  Only @{WORKSPACE_EMAIL_DOMAIN} addresses can join this workspace.
                </span>
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className={inputClass}
                />
              </Field>

              {error && <p className="text-sm text-danger">⚠ {error}</p>}

              <Button
                type="submit"
                size="lg"
                className="mt-1 w-full"
                magnetic={false}
                disabled={loading || available === null}
              >
                {loading ? "Creating…" : available === null ? "Checking…" : "Create account"}
                {!loading && available !== null && <ArrowRight className="h-4 w-4" />}
              </Button>
            </form>

            <p className="mt-8 border-t border-line/60 pt-5 text-center text-sm font-light text-secondary">
              Already have an account?{" "}
              <Link href="/portal/login" className="font-medium text-foreground underline-offset-4 hover:underline">
                Sign in
              </Link>
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}
