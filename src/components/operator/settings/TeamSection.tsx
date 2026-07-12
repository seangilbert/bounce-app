"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UsersThree, Plus, X, CircleNotch, Copy, CheckCircle, Trash } from "@phosphor-icons/react/dist/ssr";
import { MEMBER_ROLES, roleLabel, type MemberRole } from "@/lib/operator/roles";
import type { TeamMember, TeamInvite } from "@/lib/operator/members";
import {
  inviteMemberAction,
  updateMemberRoleAction,
  removeMemberAction,
  revokeInviteAction,
} from "@/app/(operator)/settings/team-actions";

export function TeamSection({
  teamEnabled,
  members,
  invites,
  currentUserId,
}: {
  teamEnabled: boolean;
  members: TeamMember[];
  invites: TeamInvite[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("employee");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);

  const adminCount = members.filter((m) => m.role === "admin").length;

  async function upgrade() {
    setUpgrading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: "growing" }),
      });
      const json = await res.json();
      if (res.ok && json.url) window.location.href = json.url;
      else setUpgrading(false);
    } catch {
      setUpgrading(false);
    }
  }

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard blocked */
    }
  }

  async function invite() {
    setBusy(true);
    setError(null);
    setInviteUrl(null);
    const res = await inviteMemberAction({ email, role });
    if (res.ok) {
      setInviteUrl(res.inviteUrl);
      setEmail("");
      router.refresh();
    } else {
      setError(res.error);
    }
    setBusy(false);
  }

  async function changeRole(userId: string, next: MemberRole) {
    setError(null);
    const res = await updateMemberRoleAction({ userId, role: next });
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  async function remove(userId: string) {
    setError(null);
    const res = await removeMemberAction(userId);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  async function revoke(id: string) {
    setError(null);
    const res = await revokeInviteAction(id);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  return (
    <div className="rounded-2xl border border-sand-line bg-white p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
        <UsersThree size={20} weight="fill" className="text-ink-mute" /> Team
      </h2>
      <p className="mt-0.5 text-[13.5px] font-medium text-ink-mute">
        Admins manage everything; employees handle day-to-day operations (no settings, billing, or refunds).
      </p>

      {/* Members */}
      <div className="mt-4 flex flex-col gap-2">
        {members.map((m) => {
          const isYou = m.userId === currentUserId;
          const lastAdmin = m.role === "admin" && adminCount <= 1;
          return (
            <div key={m.userId} className="flex items-center gap-3 rounded-xl border border-sand bg-white px-3 py-2.5">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand font-display text-[13px] font-extrabold text-white">
                {(m.email ?? "?").slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-bold text-ink">
                  {m.email ?? "—"} {isYou ? <span className="text-[12px] font-semibold text-ink-mute">(you)</span> : null}
                </div>
              </div>
              <select
                value={m.role}
                onChange={(e) => changeRole(m.userId, e.target.value as MemberRole)}
                disabled={lastAdmin}
                title={lastAdmin ? "Your account needs at least one admin." : undefined}
                className="input h-9 w-[116px] py-0 text-[13px] disabled:opacity-60"
              >
                {MEMBER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
              <button
                onClick={() => remove(m.userId)}
                disabled={isYou || lastAdmin}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-ink-mute transition-colors hover:bg-coral-tint hover:text-coral-deep disabled:opacity-30"
                aria-label="Remove"
                title={isYou ? "You can't remove yourself" : "Remove"}
              >
                <Trash size={16} weight="bold" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Pending invites */}
      {invites.length > 0 ? (
        <div className="mt-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-faint">Pending invites</div>
          <div className="mt-2 flex flex-col gap-2">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 rounded-xl border border-sand-line bg-cream px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-ink">{inv.email}</div>
                  <div className="text-[12px] font-medium text-ink-mute">{roleLabel(inv.role)} · pending</div>
                </div>
                <button
                  onClick={() => revoke(inv.id)}
                  className="rounded-full border border-sand px-3 py-1.5 text-[12.5px] font-bold text-coral-deep transition-colors hover:bg-coral-tint"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Invite form / upsell */}
      {teamEnabled ? (
        <div className="mt-4 space-y-2 rounded-xl border border-sand-line bg-cream p-3">
          <div className="text-[13px] font-bold text-ink-soft">Invite a teammate</div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="name@email.com"
              className="input flex-1"
            />
            <select value={role} onChange={(e) => setRole(e.target.value as MemberRole)} className="input sm:w-[130px]">
              {MEMBER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
            <button
              onClick={invite}
              disabled={busy}
              className="flex items-center justify-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-deep disabled:opacity-60"
            >
              {busy ? <CircleNotch size={14} weight="bold" className="animate-spin" /> : <Plus size={14} weight="bold" />} Invite
            </button>
          </div>
          {inviteUrl ? (
            <div className="flex items-center gap-2 rounded-lg border border-teal-line bg-teal-tint px-3 py-2">
              <span className="text-[12.5px] font-bold text-teal-deep">Invite sent.</span>
              <code className="flex-1 truncate rounded bg-white px-2 py-1 font-mono text-[11.5px] text-ink">{inviteUrl}</code>
              <button onClick={() => copy(inviteUrl, "invite")} className="text-ink-mute hover:text-ink" aria-label="Copy link">
                {copied === "invite" ? <CheckCircle size={15} weight="fill" className="text-teal" /> : <Copy size={15} weight="bold" />}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-brand-tint/50 px-4 py-3">
          <div className="text-[13.5px] font-semibold text-ink-soft">
            Adding team members is a <b>Growing</b> plan feature. Invite admins + employees to help run your business.
          </div>
          <button
            onClick={upgrade}
            disabled={upgrading}
            className="mt-2 flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-deep disabled:opacity-60"
          >
            {upgrading ? <CircleNotch size={14} weight="bold" className="animate-spin" /> : null} Upgrade to Growing
          </button>
        </div>
      )}

      {error ? (
        <div className="mt-2 rounded-lg bg-coral-tint px-3 py-2 text-sm font-semibold text-coral-deep">{error}</div>
      ) : null}
    </div>
  );
}
