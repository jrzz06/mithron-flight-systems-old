import styles from "../auth/auth-page.module.css";

export default function ForgotPasswordLoading() {
  return (
    <main className={styles.page} role="status" aria-live="polite" aria-label="Loading password recovery">
      <section className={styles.card}>
        <div
          className="animate-pulse rounded-full bg-white/10"
          style={{ width: "7rem", height: "0.75rem" }}
          aria-hidden="true"
        />
        <div
          className="mt-4 animate-pulse rounded-lg bg-white/10"
          style={{ width: "70%", height: "2rem" }}
          aria-hidden="true"
        />
        <div
          className="mt-4 animate-pulse rounded-lg bg-white/10"
          style={{ width: "100%", height: "3rem" }}
          aria-hidden="true"
        />
        <div
          className="mt-8 animate-pulse rounded-full bg-white/10"
          style={{ width: "100%", height: "2.75rem" }}
          aria-hidden="true"
        />
      </section>
      <span className="sr-only">Loading password recovery.</span>
    </main>
  );
}
