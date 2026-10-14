export type RecoveryCredential =
  | { kind: "access_token"; value: string }
  | { kind: "token_hash"; value: string };

export interface RecoveryLocationResult {
  credential?: RecoveryCredential;
  error?: "expired" | "invalid";
}

export function parsePasswordRecoveryLocation(url: string): RecoveryLocationResult {
  try {
    const parsed = new URL(url);
    const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));
    const errorCode = fragment.get("error_code") || parsed.searchParams.get("error_code");
    const providerError = fragment.get("error") || parsed.searchParams.get("error");
    const errorDescription =
      fragment.get("error_description") || parsed.searchParams.get("error_description");

    if (errorCode === "otp_expired") return { error: "expired" };
    if (errorCode || providerError || errorDescription) return { error: "invalid" };

    const fragmentType = fragment.get("type");
    const accessToken = fragment.get("access_token")?.trim() ?? "";
    if (accessToken && (!fragmentType || fragmentType === "recovery")) {
      return { credential: { kind: "access_token", value: accessToken } };
    }

    const queryType = parsed.searchParams.get("type");
    const tokenHash = parsed.searchParams.get("token_hash")?.trim() ?? "";
    if (tokenHash && (!queryType || queryType === "recovery")) {
      return { credential: { kind: "token_hash", value: tokenHash } };
    }

    return { error: "invalid" };
  } catch {
    return { error: "invalid" };
  }
}

export function validateNewPassword(password: string, confirmation: string): string {
  if (password.length < 8) return "Use a password with at least 8 characters.";
  if (password !== confirmation) return "Passwords do not match.";
  return "";
}

export function acquireSubmissionLock(lock: { current: boolean }): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}
