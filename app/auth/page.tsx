import { AuthView } from "@/src/components/AuthView";

interface AuthPageProps {
  searchParams: Promise<{
    redirectTo?: string;
    reason?: string;
    mode?: string;
  }>;
}

export default async function AuthPage({ searchParams }: AuthPageProps) {
  const params = await searchParams;
  const redirectTo = params.redirectTo ?? "/dashboard";
  const reason = params.reason ?? "";
  const initialMode = params.mode === "reset" ? "reset" : "login";

  return <AuthView redirectTo={redirectTo} reason={reason} initialMode={initialMode} />;
}
