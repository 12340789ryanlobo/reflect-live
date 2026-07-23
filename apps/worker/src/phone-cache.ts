export interface PlayerRef { id: number; team_id: number; }
// One phone can map to several roster rows: an athlete on more than one
// team (same number) has one PlayerRef per team, so the value is a list.
export type PhoneLoader = () => Promise<Map<string, PlayerRef[]>>;

export class PhoneCache {
  private data: Map<string, PlayerRef[]> | null = null;
  private loadedAt = 0;
  constructor(private loader: PhoneLoader, private ttlMs: number) {}

  private async ensure(): Promise<Map<string, PlayerRef[]>> {
    const now = Date.now();
    if (!this.data || now - this.loadedAt > this.ttlMs) {
      this.data = await this.loader();
      this.loadedAt = now;
    }
    return this.data;
  }

  /** Every roster row sharing this phone (one per team for a multi-team
   *  athlete). Empty array when the number is on no roster. */
  async lookupAll(phone: string): Promise<PlayerRef[]> {
    return (await this.ensure()).get(phone) ?? [];
  }

  invalidate() {
    this.data = null;
  }
}
