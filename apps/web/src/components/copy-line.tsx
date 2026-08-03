"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyLine({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="dl-copy">
      <code>{value}</code>
      <button
        type="button"
        aria-label={copied ? "Copied" : "Copy"}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            /* ignore */
          }
        }}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}
