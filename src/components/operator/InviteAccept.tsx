"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Confetti, CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/utils/supabase/client";
import { roleLabel, type MemberRole } from "@/lib/operator/roles";
import { acceptInviteAction, acceptInviteWithSignupAction } from "@/app/invite/actions";

export function InviteAccept({
  token,
  operatorName,
  email,
  role,
  sessionEmail,
}: {
  token: string;
  operatorName: string;
  email: string;
  role: MemberRole;
  sessionEmail: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  // Who's viewing this link?
  const isInvitedPerson = !!sessionEmail && sessionEmail.toLowerCase() === email.toLowerCase();
  const wrongAccount = !!sessionEmail && !isInvitedPerson;

  async function signOutAndReload() {
    await createClient().auth.signOut();
    router.refresh();
  }
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function acceptAsMe() {
    setBusy(true);
    setError(null);
    const res = await acceptInviteAction(token);
    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setError(res.error);
      setBusy(false);
    }
  }

  async function acceptAndCreate() {
    setBusy(true);
    setError(null);
    const res = await acceptInviteWithSignupAction({ token, password, name });
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    // Establish the session for the new account, then land on the dashboard.
    const { error: signInErr } = await createClient().auth.signInWithPassword({ email: res.email, password });
    if (signInErr) {
      setError("Account created — please sign in.");
      setBusy(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream px-6">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand text-white">
            <Confetti size={20} weight="fill" />
          </span>
          <span className="font-display text-lg font-extrabold tracking-tight text-ink">Bounce</span>
        </div>

        <div className="rounded-[24px] border border-sand-line bg-white p-6 shadow-sm">
          <h1 className="font-display text-xl font-bold text-ink">Join {operatorName}</h1>
          <p className="mt-1 text-sm font-medium text-ink-mute">
            You&rsquo;ve been invited as <b>{roleLabel(role)}</b> ({email}).
          </p>

          {wrongAccount ? (
            // Someone else (e.g. the admin) is signed in — don't consume the invite.
            <>
              <div className="mt-5 rounded-xl bg-amber-tint px-4 py-3 text-[13.5px] font-semibold text-amber-deep">
                You&rsquo;re signed in as <b>{sessionEmail}</b>, but this invite is for <b>{email}</b>.
                Sign out to accept it as {email}.
              </div>
              <button
                onClick={signOutAndReload}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-deep"
              >
                Sign out to continue
              </button>
            </>
          ) : isInvitedPerson ? (
            <button
              onClick={acceptAsMe}
              disabled={busy}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:bg-sand disabled:text-ink-mute"
            >
              {busy ? <CircleNotch size={18} weight="bold" className="animate-spin" /> : null} Accept invitation
            </button>
          ) : (
            <>
              <label className="mt-5 block">
                <span className="mb-1 block text-[13px] font-bold text-ink-soft">Your name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="First and last"
                  className="input"
                />
              </label>
              <label className="mt-3 block">
                <span className="mb-1 block text-[13px] font-bold text-ink-soft">Create a password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="input"
                />
              </label>
              <button
                onClick={acceptAndCreate}
                disabled={busy || password.length < 8}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:bg-sand disabled:text-ink-mute"
              >
                {busy ? <CircleNotch size={18} weight="bold" className="animate-spin" /> : null} Accept &amp; create account
              </button>
              <p className="mt-3 text-center text-[13px] font-medium text-ink-mute">
                This creates your login for <b>{email}</b>.
              </p>
            </>
          )}

          {error ? (
            <div className="mt-4 rounded-xl bg-coral-tint px-4 py-3 text-sm font-semibold text-coral-deep">{error}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
