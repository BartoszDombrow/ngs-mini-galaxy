import { AppShell } from "../_components/app-shell";
import { AuthForm } from "../_components/auth-form";

export default function RegisterPage() {
  return (
    <AppShell>
      <AuthForm mode="register" />
    </AppShell>
  );
}
