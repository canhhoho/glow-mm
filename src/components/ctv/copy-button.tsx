"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Nút sao chép link giới thiệu (cổng CTV). */
export function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="touch"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Trình duyệt chặn clipboard → người dùng tự chọn và chép link.
        }
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? done : label}
    </Button>
  );
}
