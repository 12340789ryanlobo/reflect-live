'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/dashboard-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { prettyDate } from '@/lib/format';

interface Row { clerk_user_id: string; email: string | null; name: string | null; role: string; created_at: string; }

export default function AdminUsersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const r = await fetch('/api/users');
    const j = await r.json();
    setRows(j.users ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function setRole(id: string, role: string) {
    setBusyId(id);
    await fetch('/api/users', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clerk_user_id: id, role }) });
    await load();
    setBusyId(null);
  }

  return (
    <>
      <PageHeader title="Users & roles" subtitle={<Badge variant="destructive">Admin only</Badge>} />
      <main className="flex flex-1 flex-col gap-6 p-6">
        <p className="text-xs text-muted-foreground">Roles take effect immediately. Users can&apos;t change their own role.</p>
        <Card>
          <CardContent className="px-0">
            {loading ? <p className="p-6 text-sm italic text-muted-foreground">Loading…</p> : rows.length === 0 ? (
              <p className="p-6 text-sm italic text-muted-foreground">No users yet.</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Joined</TableHead></TableRow></TableHeader>
                <TableBody>
                  {rows.map((u) => (
                    <TableRow key={u.clerk_user_id}>
                      <TableCell className="font-mono text-xs">{u.email ?? <span className="text-muted-foreground italic">— (not loaded)</span>}</TableCell>
                      <TableCell>{u.name ?? '—'}</TableCell>
                      <TableCell>
                        <Select value={u.role} onValueChange={(v) => setRole(u.clerk_user_id, v)} disabled={busyId === u.clerk_user_id}>
                          <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="coach">Coach</SelectItem>
                            <SelectItem value="captain">Captain</SelectItem>
                            <SelectItem value="athlete">Athlete</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">{prettyDate(u.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
