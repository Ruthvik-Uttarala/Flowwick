"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

interface PostDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function PostDetailDrawer({
  isOpen,
  onClose,
  title,
  children,
}: PostDetailDrawerProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          key="post-drawer-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute inset-0 bg-black/45 backdrop-blur-[1.5px]"
          />

          <motion.div
            key="post-drawer-card"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative z-10 flex w-full max-w-[1100px] flex-col overflow-hidden rounded-t-2xl border border-[color:var(--fc-border-subtle)] bg-white [max-height:calc(100vh-72px)] shadow-[0_-12px_32px_rgba(0,0,0,0.16)] sm:rounded-2xl sm:[max-height:calc(100vh-96px)] sm:shadow-[0_24px_54px_rgba(0,0,0,0.16)]"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[color:var(--fc-border-subtle)] bg-white px-4 py-3">
              <p className="truncate text-sm font-semibold text-[color:var(--fc-text-primary)]">
                {title}
              </p>
              <button
                type="button"
                aria-label="Close detail"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--fc-border-subtle)] bg-white text-[color:var(--fc-text-primary)] hover:bg-[color:var(--fc-surface-muted)]"
              >
                <X size={18} strokeWidth={1.8} />
              </button>
            </div>
            <div className="overflow-y-auto">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
