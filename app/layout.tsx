import type { Metadata } from "next";
import { Navbar } from "@/src/components/Navbar";
import { AuthProvider } from "@/src/context/AuthContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlowCart",
  description: "Post once. Share everywhere.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased bg-white">
      <body className="relative isolate flex min-h-full flex-col bg-white text-[color:var(--fc-text-primary)]">
        <AuthProvider>
          <Navbar />
          <main className="relative z-10 mx-auto flex w-full max-w-[975px] flex-1 px-0 pb-24 pt-4 sm:px-6 sm:pb-8">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
