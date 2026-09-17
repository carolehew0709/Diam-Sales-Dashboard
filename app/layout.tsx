import "./globals.css";
import { I18nProvider } from "@/components/i18n-provider";
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
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
