import "./globals.css";
import DashboardApp from "@/components/dashboard-app";
import { I18nProvider } from "@/components/i18n-provider";
import { reloadScrollResetScript } from "@/lib/reload-scroll";
export const metadata = {
  title: "DIAM APAC · Sales Performance",
  description: "APAC sales performance and China entity reporting",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: reloadScrollResetScript }} />
      </head>
      <body>
        <I18nProvider><DashboardApp />{children}</I18nProvider>
      </body>
    </html>
  );
}
