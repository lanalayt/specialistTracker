import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";
import { getServerThemeColors } from "@/lib/serverTheme";
import { themeCssText } from "@/lib/themeCss";

export const metadata: Metadata = {
  title: "Specialist Tracker",
  description: "Special teams performance tracking platform",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolve the team's theme on the server so the very first paint is correct
  // (no flash) without any client-side storage. Falls back to the CSS defaults
  // in globals.css when logged out / not resolvable.
  const theme = await getServerThemeColors();

  return (
    <html lang="en" className="dark">
      <head>
        {theme && (
          <>
            {/* `:root:root` outranks the default vars in globals.css regardless
                of stylesheet order, guaranteeing a correct first paint. */}
            <style dangerouslySetInnerHTML={{ __html: `:root:root{${themeCssText(theme)}}` }} />
            <script
              dangerouslySetInnerHTML={{
                __html: `window.__ST_THEME__=${JSON.stringify(theme)}`,
              }}
            />
          </>
        )}
      </head>
      <body className="bg-bg text-slate-100 antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
