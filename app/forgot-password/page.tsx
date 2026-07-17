import { buildAuthAuditClientToken } from "@/lib/auth-audit-client";
import { ForgotPasswordForm } from "./forgot-password-form";
import styles from "../auth/auth-page.module.css";

export default async function ForgotPasswordPage() {
  const auditToken = buildAuthAuditClientToken();

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Password recovery</p>
        <h1 className={styles.title}>Reset your password</h1>
        <p className={styles.copy}>We will email you a secure link to choose a new password.</p>
        <ForgotPasswordForm auditToken={auditToken} />
      </section>
    </main>
  );
}
