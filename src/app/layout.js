import {
  Geist,
  Geist_Mono,
} from "next/font/google";

import "./globals.css";

import AuthGuard from "./AuthGuard";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title:
    "SIGN BUSINESS Management System",

  description:
    "THANEE ADVERTISING Management System",
};

export default function RootLayout({
  children,
}) {
  return (
    <html lang="th">
      <body
        className={`${geistSans.variable} ${geistMono.variable}`}
      >
        <AuthGuard>
          {children}
        </AuthGuard>
      </body>
    </html>
  );
}