import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  subsets: ["latin"],
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Equinfo — AI Financial Research Terminal",
  description: "Source-grounded equity intelligence with transparent, traceable analysis powered by Anthropic and Gemini",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-[#080a0f]">
      <body
        className={`${ibmPlexMono.className} antialiased bg-[#080a0f] text-[#c9d4e0] scanlines`}
      >
        {children}
      </body>
    </html>
  );
}
