import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The BLK Shelf App",
  description:
    "Discover Black indie books by mood, story, genre, and the voices you want more of.",
  applicationName: "The BLK Shelf",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "The BLK Shelf",
  },
  icons: {
    icon: { url: "/blk-shelf-home-icon-192.png", sizes: "192x192", type: "image/png" },
    apple: { url: "/blk-shelf-home-icon-180.png", sizes: "180x180", type: "image/png" },
  },
};

export const viewport: Viewport = {
  themeColor: "#130e0b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
