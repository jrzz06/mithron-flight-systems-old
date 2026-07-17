import { Metadata } from "next";
import { ResetPasswordForm } from "./reset-password-form";
import styles from "../auth/auth-page.module.css";

export const metadata: Metadata = {
  title: "Set new password · Mithron Flight Systems",
  description: "Secure your Mithron account with a new password."
};

export default function ResetPasswordPage() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Password recovery</p>
        <h1 className={styles.title}>Set a new password</h1>
        <p className={styles.copy}>Choose a strong password for your Mithron account.</p>
        <ResetPasswordForm />
      </section>
    </main>
  );
}
