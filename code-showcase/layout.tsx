/**
 * EduPortal Root Layout
 * ======================
 * Google Fonts, theme provider, global widgets, hydration safety.
 */
import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import NextAuthProvider from "@/components/providers/session-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import ChatbotWidget from "@/components/chatbot/chatbot-widget";
import AnnouncementBanner from "@/components/ui/announcement-banner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "[School Name] — EduPortal",
    template: "%s | [School Name]",
  },
  description:
    "Official school portal. Track learner performance, AI predictions and recommendations — powered by EduAnalytics.",
  keywords: ["school portal", "education", "student performance", "South Africa"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${plusJakarta.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>
          <NextAuthProvider>
            <AnnouncementBanner />
            {children}
            <ChatbotWidget />
          </NextAuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
