"use client";

import { useState } from "react";

export function CopyPasswordPanel({
  email,
  temporaryPassword,
  passwordGenerated
}: {
  email: string;
  temporaryPassword: string;
  passwordGenerated?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-emerald-500/20 bg-black/20 p-3 text-xs leading-6 text-emerald-50">
      <p className="font-semibold uppercase tracking-[0.08em] text-emerald-200">Login credentials</p>
      <p className="mt-2"><span className="text-emerald-300/80">Email:</span> {email}</p>
      <p><span className="text-emerald-300/80">Password:</span> ••••••••••••</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copyPassword}
          className="inline-flex h-8 items-center rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-3 text-xs font-semibold text-emerald-100 hover:bg-emerald-950/60"
        >
          {copied ? "Copied" : "Copy password"}
        </button>
        <span className="text-emerald-300/70">
          {passwordGenerated ? "Auto-generated password. Copy it now — it will not be shown again." : "Use this password at /login."}
        </span>
      </div>
    </div>
  );
}
