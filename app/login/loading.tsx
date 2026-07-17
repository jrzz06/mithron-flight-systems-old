import styles from "./login.module.css";

export default function LoginLoading() {
  return (
    <main className={styles.loginRoot} role="status" aria-live="polite" aria-label="Loading login">
      <div className={styles.heroLayer} aria-hidden="true" />
      <div className={styles.cardWrap}>
        <div className={styles.card}>
          <div className={styles.skeletonBlock} style={{ width: "8rem", height: "1.5rem" }} />
          <div className={styles.skeletonBlock} style={{ width: "100%", height: "2.875rem", marginTop: "1.75rem" }} />
          <div className={styles.skeletonBlock} style={{ width: "100%", height: "2.875rem", marginTop: "1.25rem" }} />
          <div className={styles.skeletonBlock} style={{ width: "100%", height: "2.875rem", marginTop: "1.25rem" }} />
        </div>
      </div>
      <span className="sr-only">Loading login.</span>
    </main>
  );
}
