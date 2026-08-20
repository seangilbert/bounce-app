"use client";

import { useEffect, useState } from "react";
import { ChatCircleText } from "@phosphor-icons/react/dist/ssr";

/**
 * The hero's AI-quote demo: the storefront chat mock played as a timed
 * sequence (ask → typing → quote → follow-up), held, then looped. The whole
 * pitch is speed-of-reply, so this is the one place on the site motion is
 * doing the selling.
 *
 * - Under prefers-reduced-motion the full conversation renders statically.
 * - An invisible copy of the finished conversation sizes the card, so the
 *   hero's height never shifts while messages animate in.
 * - The visual is aria-hidden; screen readers get a plain transcript.
 */

// Step timeline (ms from loop start). Steps: 1 customer, 2 typing, 3 quote,
// 4 follow-up; then fade and restart.
const TIMELINE: Array<[number, number]> = [
  [600, 1],
  [1700, 2],
  [3300, 3],
  [4400, 4],
];
const FADE_AT = 9200;
const RESTART_AT = 9800;

function CustomerBubble() {
  return (
    <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-brand px-3.5 py-2.5 text-sm font-medium text-white">
      Need a bounce house + 4 tables for Sat June 20, in Katy 77494
    </div>
  );
}

function QuoteBubble() {
  return (
    <div className="max-w-[88%] rounded-2xl rounded-bl-md bg-cream px-3.5 py-2.5 text-sm font-medium text-ink-soft">
      Good news, the Castle Combo is available that day. Here&apos;s your quote:
      <div className="mt-2 space-y-1 rounded-xl border border-sand-line bg-white p-2.5 text-[13px]">
        <div className="flex justify-between"><span>Castle Combo (1 day)</span><span className="font-bold text-ink">$225</span></div>
        <div className="flex justify-between"><span>6ft tables × 4</span><span className="font-bold text-ink">$40</span></div>
        <div className="flex justify-between"><span>Delivery to Katy</span><span className="font-bold text-ink">$25</span></div>
        <div className="mt-1 flex justify-between border-t border-sand-line pt-1"><span className="font-bold text-ink">Total</span><span className="font-extrabold text-ink">$290</span></div>
      </div>
    </div>
  );
}

function FollowUpBubble() {
  return (
    <div className="max-w-[70%] rounded-2xl rounded-bl-md bg-cream px-3.5 py-2.5 text-sm font-medium text-ink-soft">
      Want me to lock in June 20? 🎉
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-md bg-cream px-3.5 py-3">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-chat-dot rounded-full bg-ink-mute"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </div>
  );
}

export function HeroChatDemo() {
  const [reduced, setReduced] = useState(false);
  const [step, setStep] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduced) return;
    let alive = true;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) =>
      timers.push(window.setTimeout(() => { if (alive) fn(); }, ms));
    const run = () => {
      setFading(false);
      setStep(0);
      for (const [ms, s] of TIMELINE) at(ms, () => setStep(s));
      at(FADE_AT, () => setFading(true));
      at(RESTART_AT, run);
    };
    run();
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, [reduced]);

  const conversation = (
    <>
      <CustomerBubble />
      <QuoteBubble />
      <FollowUpBubble />
    </>
  );

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-sand-line bg-white p-5 shadow-xl shadow-ink/5">
      <div className="flex items-center gap-2 border-b border-sand-line pb-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-white">
          <ChatCircleText size={16} weight="fill" />
        </span>
        <div className="text-sm font-bold text-ink">Sunny Rentals</div>
        <span className="ml-auto flex items-center gap-1 text-[11px] font-bold text-teal">
          <span className="h-1.5 w-1.5 rounded-full bg-teal" /> Online
        </span>
      </div>

      {/* Plain transcript for screen readers; the animated visual is decorative. */}
      <p className="sr-only">
        A customer asks: Need a bounce house and 4 tables for Saturday June 20 in Katy 77494.
        The AI assistant replies instantly with a quote: Castle Combo one day $225, four 6ft
        tables $40, delivery to Katy $25, total $290, and offers to lock in the date.
      </p>

      {reduced ? (
        <div aria-hidden="true" className="space-y-3 py-4">{conversation}</div>
      ) : (
        <div aria-hidden="true" className="relative">
          {/* Invisible finished conversation reserves the height. */}
          <div className="invisible space-y-3 py-4">{conversation}</div>
          <div
            className={`absolute inset-0 space-y-3 py-4 transition-opacity duration-500 ${
              fading ? "opacity-0" : "opacity-100"
            }`}
          >
            {step >= 1 && <div className="animate-chat-pop"><CustomerBubble /></div>}
            {step === 2 && <div className="animate-chat-pop"><TypingBubble /></div>}
            {step >= 3 && <div className="animate-chat-pop"><QuoteBubble /></div>}
            {step >= 4 && <div className="animate-chat-pop"><FollowUpBubble /></div>}
          </div>
        </div>
      )}
    </div>
  );
}
