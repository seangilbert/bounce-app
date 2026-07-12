"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleNotch, CheckCircle, SignOut } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/utils/supabase/client";

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-sand-line bg-white p-5">
      <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
      {desc ? <p className="mt-0.5 text-[13.5px] font-medium text-ink-mute">{desc}</p> : null}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function AccountManager({
  currentEmail,
  currentName,
}: {
  currentEmail: string;
  currentName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(currentName);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameDone, setNameDone] = useState(false);
  const [nameErr, setNameErr] = useState<string | null>(null);

  const [email, setEmail] = useState(currentEmail);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);

  const [pw, setPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwDone, setPwDone] = useState(false);
  const [pwErr, setPwErr] = useState<string | null>(null);

  async function changeName() {
    setNameBusy(true);
    setNameErr(null);
    setNameDone(false);
    const { error } = await createClient().auth.updateUser({ data: { name: name.trim() } });
    if (error) setNameErr(error.message);
    else {
      setNameDone(true);
      router.refresh(); // update the sidebar + greeting immediately
    }
    setNameBusy(false);
  }

  async function changeEmail() {
    setEmailBusy(true);
    setEmailErr(null);
    setEmailMsg(null);
    const { error } = await createClient().auth.updateUser({ email: email.trim() });
    if (error) setEmailErr(error.message);
    else setEmailMsg(`Confirm the change from the link we sent to ${email.trim()}.`);
    setEmailBusy(false);
  }

  async function changePassword() {
    setPwBusy(true);
    setPwErr(null);
    setPwDone(false);
    const { error } = await createClient().auth.updateUser({ password: pw });
    if (error) setPwErr(error.message);
    else {
      setPwDone(true);
      setPw("");
    }
    setPwBusy(false);
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <Card title="Display name" desc="Shown in your greeting, the sidebar, and to your team.">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First and last"
            className="input flex-1"
            autoComplete="name"
          />
          <button
            onClick={changeName}
            disabled={nameBusy || name.trim().length < 2 || name.trim() === currentName}
            className="flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-deep disabled:bg-sand disabled:text-ink-mute"
          >
            {nameBusy ? <CircleNotch size={15} weight="bold" className="animate-spin" /> : null} Save name
          </button>
        </div>
        {nameDone ? (
          <div className="mt-2 flex items-center gap-1.5 text-sm font-bold text-teal">
            <CheckCircle size={16} weight="fill" /> Saved.
          </div>
        ) : null}
        {nameErr ? <div className="mt-2 text-sm font-semibold text-coral-deep">{nameErr}</div> : null}
      </Card>

      <Card title="Login email" desc="You'll confirm the change from a link sent to the new address.">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input flex-1"
            autoComplete="email"
          />
          <button
            onClick={changeEmail}
            disabled={emailBusy || !email.trim() || email.trim() === currentEmail}
            className="flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-deep disabled:bg-sand disabled:text-ink-mute"
          >
            {emailBusy ? <CircleNotch size={15} weight="bold" className="animate-spin" /> : null} Update email
          </button>
        </div>
        {emailMsg ? (
          <div className="mt-2 flex items-center gap-1.5 text-sm font-bold text-teal">
            <CheckCircle size={16} weight="fill" /> {emailMsg}
          </div>
        ) : null}
        {emailErr ? <div className="mt-2 text-sm font-semibold text-coral-deep">{emailErr}</div> : null}
      </Card>

      <Card title="Password">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="New password (min 8 characters)"
            className="input flex-1"
            autoComplete="new-password"
          />
          <button
            onClick={changePassword}
            disabled={pwBusy || pw.length < 8}
            className="flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-deep disabled:bg-sand disabled:text-ink-mute"
          >
            {pwBusy ? <CircleNotch size={15} weight="bold" className="animate-spin" /> : null} Update password
          </button>
        </div>
        {pwDone ? (
          <div className="mt-2 flex items-center gap-1.5 text-sm font-bold text-teal">
            <CheckCircle size={16} weight="fill" /> Password updated.
          </div>
        ) : null}
        {pwErr ? <div className="mt-2 text-sm font-semibold text-coral-deep">{pwErr}</div> : null}
      </Card>

      <Card title="Sign out">
        <button
          onClick={signOut}
          className="flex items-center gap-2 rounded-full border border-sand bg-white px-5 py-2.5 text-sm font-bold text-ink-soft hover:bg-sand"
        >
          <SignOut size={16} weight="bold" /> Sign out
        </button>
      </Card>
    </>
  );
}
