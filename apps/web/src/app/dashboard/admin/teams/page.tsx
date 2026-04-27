'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/dashboard-shell';
import { Pill } from '@/components/v3/pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Teams"
        title="Teams"
        subtitle={`${teams.length} teams registered`}
        actions={<NewTeamDialog onDone={load} />}
      />

      <main className="flex flex-1 flex-col gap-6 px-4 md:px-8 py-8">
        <section className="reveal reveal-1 rounded-2xl bg-[color:var(--card)] border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <header className="flex items-center gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold text-[color:var(--ink)]">Registered teams</h2>
          </header>
          {loading ? (
            <p className="px-6 py-10 text-center text-[13px] text-[color:var(--ink-mute)]">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[14px]">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                    <Th>Name</Th>
                    <Th>Code</Th>
                    <Th>Twilio number</Th>
                    <Th>Configured</Th>
                    <Th>Created</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {teams.map((t) => (
                    <tr key={t.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                      <Td>
                        <span className="font-semibold text-[color:var(--ink)]">{t.name}</span>
                      </Td>
                      <Td>
                        <span className="mono text-[12px]" style={{ color: 'var(--blue)' }}>
                          {t.code}
                        </span>
                      </Td>
                      <Td>
                        {t.twilio_phone_number ? (
                          <span className="mono text-[12px] text-[color:var(--ink-mute)]">
                            {t.twilio_phone_number}
                          </span>
                        ) : (
                          <span className="text-[12px] text-[color:var(--ink-dim)]">— env fallback —</span>
                        )}
                      </Td>
                      <Td>
                        {t.twilio_account_sid ? (
                          <Pill tone="green">live</Pill>
                        ) : (
                          <Pill tone="mute">fallback</Pill>
                        )}
                      </Td>
                      <Td>
                        <span className="mono text-[12px] text-[color:var(--ink-mute)] tabular">
                          {prettyDate(t.created_at)}
                        </span>
                      </Td>
                      <Td>
                        <button
                          onClick={() => setEditing(t)}
                          className="text-[12px] font-semibold transition"
                          style={{ color: 'var(--blue)' }}
                        >
                          Edit →
                        </button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-[12px] text-[color:var(--ink-mute)] leading-relaxed">
          Each team holds its own Twilio credentials. If the team leaves these blank, the worker
          falls back to the global{' '}
          <code className="mono bg-[color:var(--card)] px-1.5 py-0.5 text-[11px] rounded">
            TWILIO_ACCOUNT_SID
          </code>{' '}
          /{' '}
          <code className="mono bg-[color:var(--card)] px-1.5 py-0.5 text-[11px] rounded">
            TWILIO_AUTH_TOKEN
          </code>{' '}
          env vars.
        </p>
      </main>

      {editing && (
        <EditTeamDialog
          team={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
      {children}
    </th>
  );
}
function Td({ children }: { children?: React.ReactNode }) {
  return <td className="px-4 py-3">{children}</td>;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">
      {children}
    </label>
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
    const res = await fetch('/api/teams', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, code, description: desc || null }),
    });
    setBusy(false);
    if (res.ok) {
      setName('');
      setCode('');
      setDesc('');
      setOpen(false);
      onDone();
    } else {
      const j = await res.json();
      alert(j.error ?? 'Error');
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>+ New team</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create team</DialogTitle>
          <DialogDescription>
            The team gets a unique code (slug) used in URLs and joins.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <FieldLabel>Name</FieldLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="UChicago Women's Soccer" />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Code</FieldLabel>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              placeholder="uchicago-womens-soccer"
              className="mono"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Description</FieldLabel>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="optional" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !name || !code}>
            {busy ? 'Creating…' : 'Create team'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditTeamDialog({
  team,
  onClose,
  onDone,
}: {
  team: TeamRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(team.name);
  const [desc, setDesc] = useState(team.description ?? '');
  const [sid, setSid] = useState(team.twilio_account_sid ?? '');
  const [tok, setTok] = useState(team.twilio_auth_token ?? '');
  const [phone, setPhone] = useState(team.twilio_phone_number ?? '');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    await fetch('/api/teams', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: team.id,
        name,
        description: desc || null,
        twilio_account_sid: sid || null,
        twilio_auth_token: tok || null,
        twilio_phone_number: phone || null,
      }),
    });
    setBusy(false);
    onDone();
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {team.name}</DialogTitle>
          <DialogDescription>
            Team Twilio credentials are stored encrypted and only accessed by the worker.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <FieldLabel>Name</FieldLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Description</FieldLabel>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ink-mute)]">Twilio configuration</p>
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Account SID</FieldLabel>
            <Input
              value={sid}
              onChange={(e) => setSid(e.target.value)}
              placeholder="ACxxxxxxxx…"
              className="mono"
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Auth token</FieldLabel>
            <Input type="password" value={tok} onChange={(e) => setTok(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Twilio phone number</FieldLabel>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+14155550100 or whatsapp:+14155550100"
              className="mono"
            />
            <p className="text-[11px] text-[color:var(--ink-mute)] leading-snug">
              Prefix with{' '}
              <code className="mono bg-[color:var(--card)] px-1 rounded">whatsapp:</code> to route
              OTP codes via WhatsApp instead of SMS. Recipients must already be opted in.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
