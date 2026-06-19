import { DashboardShell } from '@/components/dashboard-shell';
import { Toaster } from 'sonner';
import type { ReactNode } from 'react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardShell>
      {children}
      <Toaster position="bottom-center" richColors closeButton />
    </DashboardShell>
  );
}
