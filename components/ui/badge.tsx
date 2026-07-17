import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  const tone = typeof props.children === "string" ? props.children.trim().toLowerCase() : "";

  return (
    <span
      className={cn(
        "type-meta inline-flex items-center rounded-full border px-2.5 py-1 text-xs",
        "border-white/80 bg-white/85 text-slate-700 shadow-[0_8px_24px_rgba(10,20,40,.04)]",
        tone === "featured" && "border-[#EEF4FF] bg-[#EEF4FF] text-[#3563FF]",
        tone === "pro" && "border-[#FFF6E8] bg-[#FFF6E8] text-[#D68C1E]",
        tone === "enterprise" && "border-[#F3F0FF] bg-[#F3F0FF] text-[#6D4CFF]",
        tone === "new" && "border-[#EAFBF1] bg-[#EAFBF1] text-[#0F9D58]",
        className
      )}
      {...props}
    />
  );
}
