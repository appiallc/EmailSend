import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthSessionProvider } from "@/components/AuthSessionProvider";
import { SwrProvider } from "@/components/SwrProvider";
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
  title: "MailTrack — Email Campaigns",
  description: "Email sending, tracking, and follow-up for outreach campaigns",
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
      <body
        className="h-full overflow-hidden bg-slate-100 text-slate-900"
        suppressHydrationWarning
      >
        <AuthSessionProvider>
          <SwrProvider>{children}</SwrProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
