import './globals.css';
import { DashboardShell } from '@/components/dashboard-shell';

export const metadata = { title: 'DIAM APAC · Sales Performance', description: 'DIAM APAC sales performance demo' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><DashboardShell>{children}</DashboardShell></body></html>;
}
