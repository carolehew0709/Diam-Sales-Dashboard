 'use client';
import Image from 'next/image';
import { Download, FileUp } from 'lucide-react';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const navigate = (tab: string, target: string) => {
    window.dispatchEvent(new CustomEvent('dashboard:navigate', { detail: tab }));
    window.setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 90);
  };
  return <main><header className="topbar"><div className="brand"><Image src="/diam-logo.png" alt="DIAM" width={94} height={30}/><span className="brand-divider"/><span className="brand-product">Sales performance</span><nav className="product-switcher"><button className="active" onClick={() => navigate('overview', 'overview')}>Sales performance</button><button onClick={() => navigate('brand', 'brand')}>Sales by brand</button></nav></div><nav className="topnav"><button onClick={() => navigate('overview', 'overview')}>Executive overview</button><button onClick={() => navigate('analysis', 'analysis')}>Analysis</button><button onClick={() => navigate('entities', 'overview')}>Business Units Entities</button><button onClick={() => navigate('checks', 'overview')}>Management checks</button></nav><div className="topbar-actions"><button className="topbar-button import" onClick={() => navigate('imports', 'import-center')}><FileUp size={15}/>Import data</button><a className="topbar-button export" href="/api/export"><Download size={15}/>Export Excel</a><span className="connection-status"><i/>Published</span></div></header><div className="app-container">{children}</div></main>;
}
