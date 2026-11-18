import { CopyButton } from "@/components/ctv/copy-button";

/** Ô link chỉ đọc + nút Sao chép (link giới thiệu, link mời, link theo dõi đơn) — dùng chung trong cổng CTV. */
export function CopyLink({ text, testId, copy, copied }: { text: string; testId: string; copy: string; copied: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="h-9 min-w-0 flex-1 truncate rounded-md border bg-muted/50 px-3 py-2 text-sm" data-testid={testId}>
        {text}
      </code>
      <CopyButton text={text} label={copy} done={copied} />
    </div>
  );
}
