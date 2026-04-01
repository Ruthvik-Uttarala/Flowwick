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
      <body className="relative isolate flex min-h-full flex-col bg-[#F5F1E8] text-[#2B1B12]">
        {/* Warm animated background */}
        <div className="warm-bg" />

        <AuthProvider>
          <Navbar />
          <main className="relative z-10 mx-auto flex w-full max-w-[1200px] flex-1 px-4 py-8 sm:px-6 lg:px-8">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
