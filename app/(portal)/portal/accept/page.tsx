"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useAuth, ROLE_LABELS } from "@/lib/auth";
import { FloatingOrb } from "@/components/orb/FloatingOrb";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { Field, inputClass } from "@/components/portal/ui";
import { api, ApiError, type InvitePreview } from "@/lib/api";

export default function AcceptInvitePage() {
  const { acceptInvite } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [checked, setChecked] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Read the token from the URL without relying on useSearchParams' Suspense rules.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    setToken(t);
    if (!t) {
      setChecked(true);
      return;
    }
    api
      .get<InvitePreview>(`/auth/invite/${t}`)
      .then((p) => {
        setPreview(p);
        setName(p.name);
      })
      .catch(() => setPreview(null))
      .finally(() => setChecked(true));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      await acceptInvite(token, password, name);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to accept invitation.");
    } finally {
      setLoading(false);
    }
  }

  const invalid = checked && (!token || !preview || !preview.valid);

  return (
    <div className="grain relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <FloatingOrb size="min(60vw, 680px)" variant="hero" speed={18} interactive parallax={40} className="-right-32 top-1/4" opacity={0.8} />

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

        {!checked ? (
          <p className="text-sm font-light text-secondary">Checking your invitation…</p>
        ) : invalid ? (
          <>
            <h1 className="text-3xl font-extralight tracking-tight">Invitation unavailable</h1>
            <p className="mt-3 text-sm font-light text-secondary">
              This invite link is invalid, has expired, or has already been used. Ask your
              administrator to send a fresh invitation.
            </p>
            <Link href="/portal/login">
              <Button size="lg" className="mt-8 w-full" magnetic={false}>
                Go to sign in <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-extralight tracking-tight">Accept your invitation</h1>
            <p className="mt-2 text-sm font-light text-secondary">
              You&apos;ve been invited as{" "}
              <span className="font-medium text-foreground">{ROLE_LABELS[preview!.role]}</span>. Set a
              password to join.
            </p>

            <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5">
              <Field label="Email">
                <input type="email" value={preview!.email} disabled className={inputClass + " opacity-70"} />
              </Field>
              <Field label="Full name">
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                />
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

              <Button type="submit" size="lg" className="mt-1 w-full" magnetic={false} disabled={loading}>
                {loading ? "Joining…" : "Join workspace"}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </Button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}
