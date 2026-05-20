import { AppShell } from "../_components/app-shell";
import { AuthForm } from "../_components/auth-form";

export default function LoginPage() {
  return (
    <AppShell>
      <AuthForm mode="login" />
    </AppShell>
  );
}
