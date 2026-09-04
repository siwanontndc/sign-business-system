import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthGuard from "./AuthGuard";
import MobileExperience from "./MobileExperience";
import DesktopWorkflowNav from "./DesktopWorkflowNav";
import DesktopSidebarMediaLink from "./DesktopSidebarMediaLink";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata = {
  applicationName: "SIGN BUSINESS",
  title: "SIGN BUSINESS Management System",
  description: "THANEE ADVERTISING Management System",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/app-icon.svg", apple: "/logo.png" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "SIGN BUSINESS" },
  formatDetection: { telephone: false },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111827",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <AuthGuard>
          {children}
          <DesktopSidebarMediaLink />
          <DesktopWorkflowNav />
          <MobileExperience />
        </AuthGuard>
      </body>
    </html>
  );
}
