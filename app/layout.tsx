import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Navbar } from "@/src/components/Navbar";
import { AuthProvider } from "@/src/context/AuthContext";
import "./globals.css";

const inter = Inter({ 
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "FlowCart - Upload once. Launch everywhere.",
  description: "Move one product draft through Shopify and Instagram in one clean edit-safe flow. FlowCart streamlines your product launches.",
};

export const viewport: Viewport = {
  themeColor: "#F7F7F7",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} bg-background antialiased`}>
      <body className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <AuthProvider>
          <Navbar />
          <main className="mx-auto w-full max-w-[1200px] px-5 py-10 sm:px-8 sm:py-12">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
