'use client';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/dashboard-shell';
import { SectionTag } from '@/components/section-tag';
import { Stamp } from '@/components/stamp';
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
        code="A2"
        eyebrow="Teams"
        title="Teams"
        subtitle={`${teams.length} TEAMS REGISTERED`}
        right={<NewTeamDialog onDone={load} />}
      />

      <main className="flex flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
        <section className="reveal reveal-1 panel overflow-hidden">
          <div className="border-b border-[color:var(--hairline)] px-5 py-3">
            <SectionTag code="A2·A" name="Registered teams" />
          </div>
          {loading ? (
            <p className="px-6 py-8 mono text-xs text-[color:var(--bone-mute)] uppercase tracking-widest">
              — loading —
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[color:var(--hairline)] bg-[color:var(--panel-raised)]/40">
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
                  <tr key={t.id} className="border-b border-[color:var(--hairline)]/50">
                    <Td>
                      <span className="font-semibold text-[color:var(--bone)]">{t.name}</span>
                    </Td>
                    <Td>
                      <span className="mono text-[0.72rem] text-[color:var(--signal)]">
                        {t.code}
                      </span>
                    </Td>
                    <Td>
                      {t.twilio_phone_number ? (
                        <span className="mono text-[0.72rem] text-[color:var(--bone-soft)]">
                          {t.twilio_phone_number}
                        </span>
                      ) : (
                        <span className="mono text-[0.68rem] uppercase tracking-[0.16em] text-[color:var(--bone-dim)]">
                          — env fallback —
                        </span>
                      )}
                    </Td>
                    <Td>
                      {t.twilio_account_sid ? (
                        <Stamp tone="on">live</Stamp>
                      ) : (
                        <Stamp tone="quiet">fallback</Stamp>
                      )}
                    </Td>
                    <Td>
                      <span className="mono text-[0.7rem] text-[color:var(--bone-mute)] tabular">
                        {prettyDate(t.created_at)}
                      </span>
                    </Td>
                    <Td>
                      <button
                        onClick={() => setEditing(t)}
                        className="mono text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--signal)] hover:text-[color:var(--bone)] transition"
                      >
                        Edit →
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <p className="mono text-[0.72rem] leading-relaxed text-[color:var(--bone-mute)]">
          Each team holds its own Twilio credentials. If the team leaves these blank, the worker
          falls back to the global{' '}
          <code className="mono bg-[color:var(--panel-raised)] px-1.5 py-0.5 text-[0.68rem]">
            TWILIO_ACCOUNT_SID
          </code>{' '}
          /{' '}
          <code className="mono bg-[color:var(--panel-raised)] px-1.5 py-0.5 text-[0.68rem]">
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
    <th className="px-4 py-3 text-left mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--bone-dim)]">
      {children}
    </th>
  );
}
function Td({ children }: { children?: React.ReactNode }) {
  return <td className="px-4 py-3">{children}</td>;
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mono text-[0.66rem] uppercase tracking-[0.2em] text-[color:var(--bone-dim)]">
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
        <Button className="mono text-[0.72rem] font-semibold uppercase tracking-[0.2em]">
          + New team
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="h-serif">Create team</DialogTitle>
          <DialogDescription>
            The team gets a unique code (slug) used in URLs and joins.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="UChicago Women's Soccer" />
          </div>
          <div className="space-y-1.5">
            <Label>Code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              placeholder="uchicago-womens-soccer"
              className="mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="optional" />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={submit}
            disabled={busy || !name || !code}
            className="mono text-[0.72rem] font-semibold uppercase tracking-[0.2em]"
          >
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
          <DialogTitle className="h-serif">Edit {team.name}</DialogTitle>
          <DialogDescription>
            Team Twilio credentials are stored encrypted and only accessed by the worker.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="pt-3 border-t border-[color:var(--hairline)]">
            <SectionTag code="TW" name="Twilio configuration" />
          </div>
          <div className="space-y-1.5">
            <Label>Account SID</Label>
            <Input
              value={sid}
              onChange={(e) => setSid(e.target.value)}
              placeholder="ACxxxxxxxx…"
              className="mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Auth token</Label>
            <Input type="password" value={tok} onChange={(e) => setTok(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Twilio phone number</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+14155550100 or whatsapp:+14155550100"
              className="mono"
            />
            <p className="text-[11px] text-[color:var(--bone-mute)] leading-snug">
              Prefix with{' '}
              <code className="mono bg-[color:var(--panel-raised)] px-1">whatsapp:</code> to route
              OTP codes via WhatsApp instead of SMS. Recipients must already be opted in.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            className="mono text-[0.72rem] font-semibold uppercase tracking-[0.2em]"
          >
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={busy}
            className="mono text-[0.72rem] font-semibold uppercase tracking-[0.2em]"
          >
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
