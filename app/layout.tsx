import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Navbar } from "@/src/components/Navbar";
import { AuthProvider } from "@/src/context/AuthContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="relative isolate flex min-h-full flex-col text-stone-800">
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_top_left,rgba(224,122,58,0.05),transparent_35%),radial-gradient(circle_at_top_right,rgba(212,165,116,0.06),transparent_30%),linear-gradient(180deg,rgba(250,249,246,0.2),rgba(245,240,235,0))]"
        />
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
