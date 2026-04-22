'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/dashboard-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { prettyDate } from '@/lib/format';

interface TeamRow {
  id: number;
  name: string;
  code: string;
  description: string | null;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_phone_number: string | null;
  created_at: string;
}

export default function AdminTeamsPage() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TeamRow | null>(null);

  async function load() {
    setLoading(true);
    const r = await fetch('/api/teams');
    const j = await r.json();
    setTeams(j.teams ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  return (
    <>
      <PageHeader title="Teams" subtitle={<Badge variant="secondary">Admin only</Badge>} right={<NewTeamDialog onDone={load} />} />
      <main className="flex flex-1 flex-col gap-6 p-6">
        <Card>
          <CardContent className="px-0">
            {loading ? <p className="p-6 text-sm italic text-muted-foreground">Loading…</p> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Twilio number</TableHead>
                    <TableHead>Configured</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teams.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="font-mono text-xs">{t.code}</TableCell>
                      <TableCell>{t.twilio_phone_number ?? <span className="text-muted-foreground italic">—</span>}</TableCell>
                      <TableCell>
                        {t.twilio_account_sid ? <Badge variant="default">Live</Badge> : <Badge variant="outline">Env fallback</Badge>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{prettyDate(t.created_at)}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => setEditing(t)}>Edit</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          Each team has its own Twilio credentials. If a team leaves these blank, the worker falls back to the global
          <code className="ml-1 rounded bg-muted px-1 text-[11px]">TWILIO_ACCOUNT_SID</code> /
          <code className="ml-1 rounded bg-muted px-1 text-[11px]">TWILIO_AUTH_TOKEN</code> env vars.
        </p>
      </main>
      {editing && <EditTeamDialog team={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />}
    </>
  );
}

function NewTeamDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    const res = await fetch('/api/teams', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, code, description: desc || null }) });
    setBusy(false);
    if (res.ok) { setName(''); setCode(''); setDesc(''); setOpen(false); onDone(); }
    else { const j = await res.json(); alert(j.error ?? 'Error'); }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>+ New team</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create team</DialogTitle><DialogDescription>The team gets a unique code (slug) used in URLs and joins.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="UChicago Women's Soccer" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Code</label>
            <Input value={code} onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="uchicago-womens-soccer" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Description</label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="optional" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !name || !code}>{busy ? 'Creating…' : 'Create team'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditTeamDialog({ team, onClose, onDone }: { team: TeamRow; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(team.name);
  const [desc, setDesc] = useState(team.description ?? '');
  const [sid, setSid] = useState(team.twilio_account_sid ?? '');
  const [tok, setTok] = useState(team.twilio_auth_token ?? '');
  const [phone, setPhone] = useState(team.twilio_phone_number ?? '');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    await fetch('/api/teams', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: team.id, name, description: desc || null, twilio_account_sid: sid || null, twilio_auth_token: tok || null, twilio_phone_number: phone || null }),
    });
    setBusy(false);
    onDone();
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Edit {team.name}</DialogTitle><DialogDescription>Team Twilio credentials are stored encrypted and only accessed by the worker.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Description</label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="pt-2 border-t"><p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Twilio configuration</p></div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Account SID</label>
            <Input value={sid} onChange={(e) => setSid(e.target.value)} placeholder="ACxxxxxxxx…" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Auth token</label>
            <Input type="password" value={tok} onChange={(e) => setTok(e.target.value)} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Twilio phone number</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+14155550100 or whatsapp:+14155550100" />
            <p className="text-[11px] text-muted-foreground mt-1">
              Prefix with <code className="rounded bg-muted px-1">whatsapp:</code> to route OTP codes via WhatsApp instead of SMS. Recipients must already be opted in (any prior WhatsApp exchange counts).
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
