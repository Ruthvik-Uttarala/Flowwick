import type { Metadata } from "next";
import { Navbar } from "@/src/components/Navbar";
import { AuthProvider } from "@/src/context/AuthContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlowCart",
  description: "Upload once. Launch everywhere.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="cinematic-shell relative isolate flex min-h-full flex-col text-[color:var(--fc-text-primary)]">
        <div className="app-atmosphere" />
        <div className="app-grain" />

        <AuthProvider>
          <Navbar />
          <main className="relative z-10 mx-auto flex w-full max-w-[1240px] flex-1 px-4 py-8 sm:px-6 lg:px-10">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
