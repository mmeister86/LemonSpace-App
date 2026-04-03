import type { Metadata } from "next";
import Script from "next/script";
import { Manrope } from "next/font/google";
import * as Sentry from "@sentry/nextjs";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/providers";
import { InitUser } from "@/components/init-user";
import { getAuthUser, getToken } from "@/lib/auth-server";
import { getLocale, getMessages, getTimeZone } from "next-intl/server";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  metadataBase: new URL("https://app.lemonspace.io"),
  title: {
    default: "LemonSpace",
    template: "%s | LemonSpace",
  },
  description: "LemonSpace is a platform for creating and sharing digital content with nodes.",
  keywords: ["LemonSpace", "digital content", "platform", "nodes"],
  authors: [{ name: "LemonSpace" }],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  openGraph: {
    type: "website",
    url: "https://app.lemonspace.io",
    siteName: "LemonSpace",
    title: "LemonSpace",
    description: "LemonSpace is a platform for creating and sharing digital content with nodes.",
  },
  twitter: {
    card: "summary_large_image",
    title: "LemonSpace",
    description: "LemonSpace is a platform for creating and sharing digital content with nodes.",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialToken = await getToken();
  const locale = await getLocale();
  const messages = await getMessages();
  const timeZone = await getTimeZone();
  const user = await getAuthUser();
  if (user) {
    const id = user.userId ?? String(user._id);
    Sentry.setUser({
      id,
      email: user.email ?? undefined,
    });
  } else {
    Sentry.setUser(null);
  }

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={cn("h-full", "antialiased", "font-sans", manrope.variable)}
    >
      <body className="min-h-full flex flex-col">
        <Script
          src="https://rybbit.matthias.lol/api/script.js"
          data-site-id="bb1ac546eda7"
          strategy="afterInteractive"
        />
        <Providers
          initialToken={initialToken}
          locale={locale}
          messages={messages}
          timeZone={timeZone}
        >
          <InitUser />
          {children}
        </Providers>
      </body>
    </html>
  );
}
