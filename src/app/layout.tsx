import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";
import { getServerBootstrap } from "@/lib/serverBootstrap";
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
  // Resolve the user's team + settings on the server so the very first paint is
  // already correct (no flash) without any client-side storage. The injected
  // bootstrap seeds the in-memory caches (teamSettingsStore, settingsSync,
  // themeColors); falls back to defaults when logged out / not resolvable.
  const boot = await getServerBootstrap();
  const theme = boot.team
    ? { primary: boot.team.colorPrimary, secondary: boot.team.colorSecondary, tertiary: boot.team.colorTertiary }
    : null;

  return (
    <html lang="en" className="dark">
      <head>
        {theme && (
          // `:root:root` outranks the default vars in globals.css regardless of
          // stylesheet order, guaranteeing a correct first paint.
          <style dangerouslySetInnerHTML={{ __html: `:root:root{${themeCssText(theme)}}` }} />
        )}
        {(boot.team || Object.keys(boot.settings).length > 0) && (
          <script
            dangerouslySetInnerHTML={{
              // Escape `<` so a user-controlled value (team name/school) can't
              // break out of the <script> tag.
              __html: `window.__ST_BOOTSTRAP__=${JSON.stringify(boot).replace(/</g, "\\u003c")}`,
            }}
          />
        )}
      </head>
      <body className="bg-bg text-slate-100 antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
