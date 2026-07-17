"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { X, Send, Sparkles, BadgeIndianRupee, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProductEnquiryForm, type ProductEnquiryFormProduct } from "@/components/product/product-enquiry-form";
import { deriveProductSku } from "@/lib/product-sku";
import { MithronProductMiniCard, type MithronProductMiniCardData } from "@/components/assistant/mithron-product-mini-card";
import styles from "./mithron-assistant-panel.module.css";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  productCard?: MithronProductMiniCardData | null;
};

const PRODUCT_INTENT_RE = /\b(price|pricing|cost|stock|availability|buy|purchase|quote|delivery|shipping)\b/i;

function productSlugFromPathname(pathname: string) {
  if (!pathname.startsWith("/product/")) return null;
  const slug = pathname.replace("/product/", "").split("/")[0]?.trim();
  return slug ? slug : null;
}

async function fetchProductSummary(slug: string) {
  const response = await fetch(`/api/products/summary?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    slug?: string;
    name?: string;
    category?: string;
    price?: number;
    image?: string | null;
    url?: string | null;
    availability?: string | null;
  };
  if (!payload?.ok || payload.slug !== slug || !payload.name) return null;
  return {
    slug,
    name: payload.name,
    category: payload.category ?? null,
    price: typeof payload.price === "number" ? payload.price : null,
    image: payload.image ?? null,
    url: payload.url ?? `/product/${slug}`,
    availability: payload.availability ?? null
  } satisfies MithronProductMiniCardData;
}

function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [locked]);
}

export function MithronAssistantPanel({
  open,
  onClose,
  selectedProductSlug
}: {
  open: boolean;
  onClose: () => void;
  selectedProductSlug: string | null;
}) {
  const [mode, setMode] = useState<"chat" | "enquiry">("chat");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "m0", role: "assistant", text: "Hi! Ask about pricing, stock, delivery, or request a quote." }
  ]);

  const [streamText, setStreamText] = useState("");
  const [productSummary, setProductSummary] = useState<MithronProductMiniCardData | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastSendRef = useRef<{ text: string; at: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const slug = useMemo(() => {
    if (selectedProductSlug) return selectedProductSlug;
    if (typeof window === "undefined") return null;
    return productSlugFromPathname(window.location.pathname);
  }, [selectedProductSlug]);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    setMode("chat");
    setStreamText("");
    setSending(false);
    abortRef.current?.abort();
    abortRef.current = null;
    const t = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLInputElement>("input[data-assistant-input]")?.focus();
    }, 40);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (sending) return;

    const now = Date.now();
    const last = lastSendRef.current;
    if (last && last.text === trimmed && now - last.at < 1200) {
      return;
    }
    lastSendRef.current = { text: trimmed, at: now };

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", text: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreamText("");
    setSending(true);

    try {
      const history = messages
        .slice(-10)
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.text }));

      const response = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message: trimmed,
          selectedProductSlug: slug,
          pageContext: productSummary
            ? {
                slug: productSummary.slug,
                productName: productSummary.name,
                category: productSummary.category ?? null,
                price: productSummary.price ?? null,
                url: productSummary.url ?? null
              }
            : slug
              ? { slug, url: typeof window !== "undefined" ? window.location.href : null }
              : null,
          history
        })
      });

      if (response.status === 401) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: "The assistant needs a server update. Please refresh the page and try again."
          }
        ]);
        return;
      }

      if (response.status === 503) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: "The assistant is being configured on the server. Please try again in a few minutes."
          }
        ]);
        return;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const payload = (await response.json().catch(() => ({}))) as { text?: unknown; error?: unknown };
        const jsonText =
          typeof payload.text === "string"
            ? payload.text
            : typeof payload.error === "string"
              ? payload.error
              : "I'm having trouble right now. Please try again.";
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", text: jsonText }]);
        return;
      }

      if (!response.ok) {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", text: "I'm having trouble right now. Please try again." }]);
        return;
      }

      if (!response.body) {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", text: "I'm having trouble right now. Please try again." }]);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        full += chunk;
        setStreamText(full);
      }

      const finalText = full.trim() || "I couldn't find that information.";
      const isProductIntent = PRODUCT_INTENT_RE.test(trimmed);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: finalText,
          productCard: slug && productSummary && isProductIntent ? productSummary : null
        }
      ]);
      setStreamText("");
      window.setTimeout(() => {
        panelRef.current?.querySelector<HTMLInputElement>("input[data-assistant-input]")?.focus();
      }, 10);
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", text: "I'm having trouble right now. Please try again." }]);
      setStreamText("");
    } finally {
      setSending(false);
    }
  }

  const enquiryProduct: ProductEnquiryFormProduct | null = useMemo(() => {
    if (!slug) return null;
    return {
      slug,
      name: productSummary?.name ?? slug,
      sku: deriveProductSku(slug),
      quantity: 1,
      productUrl: typeof window !== "undefined" ? window.location.href : undefined
    };
  }, [productSummary, slug]);

  const isGuest = useMemo(() => {
    if (typeof document === "undefined") return true;
    return !/sb-[^=;]+-auth-token=/.test(document.cookie);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (!slug) return;
    let active = true;
    void fetchProductSummary(slug).then((summary) => {
      if (!active) return;
      setProductSummary(summary);
    });
    return () => {
      active = false;
    };
  }, [open, slug]);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    const frame = window.requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, messages.length, streamText, streamText.length, sending]);

  const showStreamRow = sending || Boolean(streamText);

  const rowVirtualizer = useVirtualizer({
    count: messages.length + (showStreamRow ? 1 : 0),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 96,
    gap: 16,
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: 6
  });

  if (!open) return null;

  return (
    <div className={cn(styles.root, open && styles.isOpen)} data-mithron-ai-panel>
      <aside ref={panelRef} className={styles.panel} role="dialog" aria-modal="true" aria-label="Mithron AI Assistant">
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            {mode === "enquiry" ? (
              <button
                type="button"
                className={styles.backToChat}
                onClick={() => setMode("chat")}
                aria-label="Back to chat"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                Chat
              </button>
            ) : (
              <>
                <span className={styles.headerIcon} aria-hidden="true">
                  <Sparkles className="size-4" />
                </span>
                <p className={styles.title}>Mithron AI Assistant</p>
              </>
            )}
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        {mode === "enquiry" ? (
          <div className={styles.enquiryWrap}>
            {slug && enquiryProduct ? (
              <ProductEnquiryForm
                product={enquiryProduct}
                isGuest={isGuest}
                onSuccess={() => {
                  setMode("chat");
                  setMessages((prev) => [
                    ...prev,
                    { id: crypto.randomUUID(), role: "assistant", text: "Your enquiry has been sent successfully." }
                  ]);
                }}
              />
            ) : (
              <div className={styles.emptyState}>
                Open a product page to request a quote.
              </div>
            )}
          </div>
        ) : (
          <div className={styles.body}>
            <div className={styles.quickActions} aria-label="Quick actions">
              <button
                type="button"
                className={styles.quickAction}
                disabled={sending || !slug}
                onClick={() => void sendMessage("What is the price of this product?")}
                title={!slug ? "Open a product page to use this action." : undefined}
              >
                <BadgeIndianRupee className="size-4" aria-hidden="true" />
                <span>Price</span>
              </button>
              <button
                type="button"
                className={cn(styles.quickAction, styles.quickActionQuote)}
                disabled={sending || !slug}
                onClick={() => setMode("enquiry")}
                title={!slug ? "Open a product page to request a quote." : undefined}
              >
                Request Quote
              </button>
            </div>

            <div ref={scrollRef} className={styles.messages} role="log" aria-live="polite">
              <div
                className={styles.virtualList}
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const isStreamRow = showStreamRow && virtualRow.index === messages.length;
                  if (isStreamRow) {
                    return (
                      <div
                        key="stream"
                        className={styles.virtualRow}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          transform: `translateY(${virtualRow.start}px)`
                        }}
                      >
                        <div className={cn(styles.msgWrap, styles.msgWrapAssistant)}>
                          <div className={cn(styles.msg, styles.msgAssistant)} aria-label="Assistant response">
                            {streamText}
                            {!streamText ? (
                              <span className={styles.typingDots} aria-hidden="true">
                                <span />
                                <span />
                                <span />
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const m = messages[virtualRow.index];
                  if (!m) return null;

                  return (
                    <div
                      key={m.id}
                      className={styles.virtualRow}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start}px)`
                      }}
                    >
                      <MessageBubble
                        message={m}
                        onRequestQuote={() => setMode("enquiry")}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <form
              className={styles.composer}
              onSubmit={(e) => {
                e.preventDefault();
                void sendMessage(input);
              }}
            >
              <input
                data-assistant-input
                className={styles.input}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={slug ? "Ask about this product..." : "Ask about Mithron products..."}
                maxLength={1600}
                disabled={sending}
              />
              <button className={styles.send} type="submit" disabled={sending || !input.trim()} aria-label="Send">
                <Send className="size-4" aria-hidden="true" />
              </button>
            </form>
          </div>
        )}
      </aside>
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({
  message,
  onRequestQuote
}: {
  message: ChatMessage;
  onRequestQuote: () => void;
}) {
  return (
    <div className={cn(styles.msgWrap, message.role === "user" ? styles.msgWrapUser : styles.msgWrapAssistant)}>
      <div className={cn(styles.msg, message.role === "user" ? styles.msgUser : styles.msgAssistant)}>
        {message.text}
      </div>
      {message.role === "assistant" && message.productCard ? (
        <div className={styles.inlineCard}>
          <MithronProductMiniCard data={message.productCard} onRequestQuote={onRequestQuote} />
        </div>
      ) : null}
    </div>
  );
});
