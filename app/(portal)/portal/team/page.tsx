"use client";

import { useState } from "react";
import { Plus, Mail, Copy, Check, RotateCw, X } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import {
  PageHeading,
  Panel,
  Table,
  Row,
  Cell,
  Empty,
  Field,
  inputClass,
  StatusPill,
} from "@/components/portal/ui";
import { Modal, ModalFooter } from "@/components/portal/Modal";
import { Select } from "@/components/portal/Select";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/useApi";
import { ROLE_LABELS } from "@/lib/auth";
import {
  api,
  ApiError,
  isWorkspaceEmail,
  WORKSPACE_EMAIL_DOMAIN,
  type TeamMember,
  type Invitation,
  type Role,
} from "@/lib/api";
import { formatDate, timeAgo } from "@/lib/utils";

// Roles the CEO may assign when inviting (the CEO seat is not re-issuable).
const INVITE_ROLES: Role[] = ["CFO", "FINANCE_MANAGER", "FINANCE_EXECUTIVE"];

export default function TeamPage() {
  const { data: members, loading: membersLoading } = useApi<TeamMember[]>("/team/members");
  const { data: invites, loading: invitesLoading, refetch } = useApi<Invitation[]>("/team/invitations");
  const [inviteOpen, setInviteOpen] = useState(false);

  const pending = (invites ?? []).filter((i) => i.status === "Pending");
  const history = (invites ?? []).filter((i) => i.status !== "Pending");

  return (
    <PortalShell>
      <div className="flex flex-col gap-8">
        <PageHeading
          title="Admin"
          description="Manage your team. Invite members by email — each gets a secure link to set their password and join."
          action={
            <Button size="sm" magnetic={false} onClick={() => setInviteOpen(true)}>
              <Plus className="h-4 w-4" /> Invite member
            </Button>
          }
        />

        {/* Members */}
        <div>
          <h2 className="mb-4 text-lg font-light tracking-tight">Members</h2>
          {members && members.length > 0 ? (
            <Table head={["Name", "Email", "Role", "Joined", "Login status"]}>
              {members.map((m) => (
                <Row key={m.id}>
                  <Cell className="font-medium">{m.name}</Cell>
                  <Cell className="text-ink-40">{m.email}</Cell>
                  <Cell>
                    <StatusPill status={ROLE_LABELS[m.role]} />
                  </Cell>
                  <Cell className="text-ink-40">{formatDate(m.created_at)}</Cell>
                  <Cell>
                    <LoginStatus lastLoginAt={m.last_login_at} />
                  </Cell>
                </Row>
              ))}
            </Table>
          ) : (
            <Empty message={membersLoading ? "Loading members…" : "No members yet."} />
          )}
        </div>

        {/* Pending invitations */}
        <div>
          <h2 className="mb-4 text-lg font-light tracking-tight">Pending invitations</h2>
          {pending.length > 0 ? (
            <div className="flex flex-col gap-3">
              {pending.map((inv) => (
                <PendingInviteRow key={inv.id} invite={inv} onChanged={refetch} />
              ))}
            </div>
          ) : (
            <Empty message={invitesLoading ? "Loading…" : "No pending invitations."} />
          )}
        </div>

        {/* History */}
        {history.length > 0 && (
          <div>
            <h2 className="mb-4 text-lg font-light tracking-tight">History</h2>
            <Table head={["Name", "Email", "Role", "Status", "Sent"]}>
              {history.map((inv) => (
                <Row key={inv.id}>
                  <Cell className="font-medium">{inv.name}</Cell>
                  <Cell className="text-ink-40">{inv.email}</Cell>
                  <Cell className="text-ink-40">{ROLE_LABELS[inv.role]}</Cell>
                  <Cell>
                    <StatusPill status={inv.status} />
                  </Cell>
                  <Cell className="text-ink-40">{formatDate(inv.created_at)}</Cell>
                </Row>
              ))}
            </Table>
          </div>
        )}

        <InviteMember open={inviteOpen} onOpenChange={setInviteOpen} onSaved={refetch} />
      </div>
    </PortalShell>
  );
}

/** Green "signed in" indicator with last-active time, or a neutral "not signed in yet". */
function LoginStatus({ lastLoginAt }: { lastLoginAt?: string | null }) {
  if (lastLoginAt) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="text-xs text-foreground/80">Active · {timeAgo(lastLoginAt)}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-ink-40">
      <span className="h-2 w-2 rounded-full bg-ink-20" />
      <span className="text-xs">Not signed in yet</span>
    </span>
  );
}

function PendingInviteRow({ invite, onChanged }: { invite: Invitation; onChanged: () => void }) {
  const [busy, setBusy] = useState<null | "resend" | "revoke">(null);
  const [copied, setCopied] = useState(false);
  // The freshly-created/resent invite carries an accept_url + email_sent flag.
  const [link, setLink] = useState<string | null>(invite.accept_url ?? null);
  const [emailSent, setEmailSent] = useState<boolean | null>(invite.email_sent ?? null);

  async function resend() {
    setBusy("resend");
    try {
      const updated = await api.post<Invitation>(`/team/invitations/${invite.id}/resend`);
      setLink(updated.accept_url ?? null);
      setEmailSent(updated.email_sent ?? null);
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  async function revoke() {
    setBusy("revoke");
    try {
      await api.post(`/team/invitations/${invite.id}/revoke`);
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  function copy() {
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Panel className="!rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium">{invite.name}</p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Awaiting login
            </span>
          </div>
          <p className="truncate text-xs text-ink-40">
            {invite.email} · {ROLE_LABELS[invite.role]}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {link && (
            <Button size="sm" variant="secondary" magnetic={false} onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
          )}
          <Button size="sm" variant="secondary" magnetic={false} disabled={busy !== null} onClick={resend}>
            <RotateCw className="h-4 w-4" /> {busy === "resend" ? "Sending…" : "Resend"}
          </Button>
          <Button size="sm" variant="secondary" magnetic={false} disabled={busy !== null} onClick={revoke}>
            <X className="h-4 w-4" /> Revoke
          </Button>
        </div>
      </div>

      {/* Delivery hint: confirm email send, or nudge to share the link if SMTP is off. */}
      {emailSent === true && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-40">
          <Mail className="h-3.5 w-3.5" /> Invitation emailed to {invite.email}.
        </p>
      )}
      {emailSent === false && link && (
        <p className="mt-3 text-xs text-foreground/70">
          ⚠ Email isn&apos;t configured — copy the link above and share it with {invite.name} directly.
        </p>
      )}
    </Panel>
  );
}

function InviteMember({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState<Role>("FINANCE_EXECUTIVE");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    if (!isWorkspaceEmail(email)) {
      setError(`Members must use a @${WORKSPACE_EMAIL_DOMAIN} email.`);
      return;
    }
    setSaving(true);
    try {
      await api.post("/team/invitations", {
        name: fd.get("name"),
        email,
        role,
      });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send invitation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Invite a member"
      description="They'll receive an email with a secure link to set their password and join."
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name">
          <input name="name" required className={inputClass} placeholder="Lena Okafor" />
        </Field>
        <Field label="Work email">
          <input
            name="email"
            type="email"
            required
            className={inputClass}
            placeholder={`lena@${WORKSPACE_EMAIL_DOMAIN}`}
          />
          <span className="mt-1 text-[11px] text-ink-40">Must be a @{WORKSPACE_EMAIL_DOMAIN} address.</span>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Role">
            <Select
              value={role}
              onValueChange={(v) => setRole(v as Role)}
              options={INVITE_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
            />
          </Field>
        </div>
        {error && <p className="sm:col-span-2 text-sm text-foreground/80">⚠ {error}</p>}
        <ModalFooter>
          <Button type="button" variant="secondary" magnetic={false} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" magnetic={false} disabled={saving}>
            <Mail className="h-4 w-4" /> {saving ? "Sending…" : "Send invitation"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
