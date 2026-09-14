'use client';

import { LogOut, PencilLine, ShieldCheck, UserCircle2, UserRoundCog } from 'lucide-react';
import { useState } from 'react';
import type { User } from '@/lib/types';
import { canManageUsers, roleLabel } from '@/lib/permissions';

export function AccountMenu({ user, onNavigate, onLogout }: { user: User; onNavigate: (tab: 'imports' | 'admin') => void; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  return <div className="account-menu"><button className="account-trigger" aria-label="Open account menu" onClick={() => setOpen((value) => !value)}><span className="account-avatar"><UserCircle2 size={19}/></span><span className="account-name">{user.name}</span><small>{roleLabel(user.role)}</small></button>{open && <div className="account-popover"><div className="account-summary"><strong>{user.name}</strong><span>{user.email}</span><em>{roleLabel(user.role)} · {user.region}</em></div><button onClick={() => { setOpen(false); onNavigate('imports'); }}><PencilLine size={15}/>Data entry</button>{canManageUsers(user) && <button onClick={() => { setOpen(false); onNavigate('admin'); }}><ShieldCheck size={15}/>Admin console</button>}<button onClick={() => setOpen(false)}><UserRoundCog size={15}/>My permissions</button><div className="account-divider"/><button className="logout-button" onClick={onLogout}><LogOut size={15}/>Logout</button></div>}</div>;
}

export function DemoLogin({ users, onLogin }: { users: User[]; onLogin: (id: string) => void }) {
  const [selected, setSelected] = useState(users[0]?.id ?? '');
  return <main className="login-page"><div className="login-panel"><div className="eyebrow">DIAM APAC / DEMO ACCESS</div><h1>Sign in to Sales Performance</h1><p>Select a demo account to preview its data scope and available actions.</p><label>Demo account<select value={selected} onChange={(event) => setSelected(event.target.value)}>{users.map((user) => <option value={user.id} key={user.id}>{user.name} · {roleLabel(user.role)}</option>)}</select></label><button className="button dark full" onClick={() => onLogin(selected)}><UserCircle2 size={16}/>Continue</button></div></main>;
}
