import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { OnboardingFlow } from "@/src/components/OnboardingFlow";

export default function InfoPage() {
  return (
    <Suspense
      fallback={
        <div className="flex w-full items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-[color:var(--fc-text-muted)]" />
        </div>
      }
    >
      <OnboardingFlow />
    </Suspense>
  );
}
