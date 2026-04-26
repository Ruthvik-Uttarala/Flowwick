import type { Metadata } from "next";
import { Navbar } from "@/src/components/Navbar";
import { AuthProvider } from "@/src/context/AuthContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flowwick",
  description: "Post once. Sell everywhere.",
  icons: {
    icon: "/brand/flowwick-symbol.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased bg-[color:var(--fc-background)]"
    >
      <body className="relative isolate flex min-h-full flex-col bg-[color:var(--fc-background)] text-[color:var(--fc-text-primary)]">
        <AuthProvider>
          <Navbar />
          <main className="relative z-10 mx-auto flex w-full max-w-[1280px] flex-1 px-4 pb-24 pt-5 sm:px-6 sm:pb-10 lg:px-8">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
