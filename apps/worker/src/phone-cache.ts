export interface PlayerRef { id: number; team_id: number; }
export type PhoneLoader = () => Promise<Map<string, PlayerRef>>;

export class PhoneCache {
  private data: Map<string, PlayerRef> | null = null;
  private loadedAt = 0;
  constructor(private loader: PhoneLoader, private ttlMs: number) {}

  async lookup(phone: string): Promise<PlayerRef | null> {
    const now = Date.now();
    if (!this.data || now - this.loadedAt > this.ttlMs) {
      this.data = await this.loader();
      this.loadedAt = now;
    }
    return this.data.get(phone) ?? null;
  }

  invalidate() {
    this.data = null;
  }
}
