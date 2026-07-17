"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import styles from "./guest-login-redirect-dialog.module.css";

const COUNTDOWN_SECONDS = 5;

type GuestLoginRedirectDialogProps = {
  open: boolean;
  next: string;
  message: string;
  onClose: () => void;
};

export function GuestLoginRedirectDialog({
  open,
  next,
  message,
  onClose
}: GuestLoginRedirectDialogProps) {
  const router = useRouter();
  const titleId = useId();
  const descId = useId();
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [mounted, setMounted] = useState(false);
  const redirectedRef = useRef(false);

  const redirectToLogin = useCallback(() => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    router.push(`/login?next=${encodeURIComponent(next)}`);
  }, [next, router]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setSecondsLeft(COUNTDOWN_SECONDS);
      redirectedRef.current = false;
      return;
    }

    redirectedRef.current = false;
    setSecondsLeft(COUNTDOWN_SECONDS);

    const interval = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [open]);

  useEffect(() => {
    if (!open || secondsLeft > 0) return;
    redirectToLogin();
  }, [open, secondsLeft, redirectToLogin]);

  useEffect(() => {
    if (!open) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyPaddingRight = document.body.style.paddingRight;
    const scrollbarGap = Math.max(0, window.innerWidth - document.documentElement.clientWidth);

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    if (scrollbarGap > 0) {
      document.body.style.paddingRight = `${scrollbarGap}px`;
    }
    document.body.setAttribute("data-modal-scroll-locked", "true");

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.paddingRight = previousBodyPaddingRight;
      document.body.removeAttribute("data-modal-scroll-locked");
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className={styles.root} data-guest-login-dialog>
      <button
        type="button"
        className={styles.backdrop}
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className={styles.layer} role="presentation">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
          className={styles.dialog}
        >
          <div className={styles.body}>
            <p id={titleId} className={styles.title}>
              Login required
            </p>
            <p id={descId} className={styles.message}>
              {message}
            </p>
            <p className={styles.countdown}>
              Redirecting to login in{" "}
              <span className={styles.countdownValue}>{secondsLeft}</span>{" "}
              second{secondsLeft === 1 ? "" : "s"}…
            </p>
          </div>
          <div className={styles.actions}>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" variant="accent" onClick={redirectToLogin}>
              Log in now
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
