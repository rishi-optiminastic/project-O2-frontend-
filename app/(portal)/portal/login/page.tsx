"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { FloatingOrb } from "@/components/orb/FloatingOrb";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { Field, inputClass } from "@/components/portal/ui";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to sign in. Is the API running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grain relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <FloatingOrb size="min(60vw, 680px)" variant="hero" speed={18} interactive parallax={40} className="-right-32 top-1/4" opacity={0.8} />

      <Link
        href="/"
        className="absolute left-6 top-6 z-10 flex items-center gap-2 text-sm font-light text-secondary transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to site
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

        <h1 className="text-3xl font-extralight tracking-tight">Welcome back</h1>
        <p className="mt-2 text-sm font-light text-secondary">
          Sign in to your secure finance workspace.
        </p>

        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5">
          <Field label="Email">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </Field>

          {error && <p className="text-sm text-danger">⚠ {error}</p>}

          <Button type="submit" size="lg" className="mt-1 w-full" magnetic={false} disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </Button>
        </form>

        <div className="mt-8 border-t border-line/60 pt-5 text-center">
          <p className="text-sm font-light text-secondary">
            First time setting up your workspace?{" "}
            <Link href="/portal/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
              Create your account
            </Link>
          </p>
          <p className="mt-2 text-[11px] tracking-eyebrow text-ink-40">
            Joined by invite? Use the link in your email to set a password.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
