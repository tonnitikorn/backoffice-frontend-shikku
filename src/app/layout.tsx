import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";

const plexThai = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ShikkuLens POS",
  description: "ระบบบริหารร้านคอนแทคเลนส์ ShikkuLens",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#93C6BF",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`h-full antialiased ${plexThai.className}`}>
      <body className="flex min-h-full flex-col bg-zinc-50 text-zinc-800">
        <ServiceWorkerRegistration />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
