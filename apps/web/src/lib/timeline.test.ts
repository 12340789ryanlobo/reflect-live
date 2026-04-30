import { describe, it, expect } from 'vitest';
import { buildTimeline, type TimelineEntry } from './timeline';
import type { ActivityLog, TwilioMessage } from '@reflect-live/shared';

function log(over: Partial<ActivityLog>): ActivityLog {
  return {
    id: 1,
    player_id: 1,
    team_id: 1,
    kind: 'workout',
    description: '',
    image_path: null,
    logged_at: '2026-04-20T10:00:00Z',
    created_at: '2026-04-20T10:00:00Z',
    source_sid: null,
    hidden: false,
    ...over,
  } as ActivityLog;
}
function msg(over: Partial<TwilioMessage>): TwilioMessage {
  return {
    sid: 'm1',
    direction: 'inbound',
    from_number: null,
    to_number: null,
    body: 'hi',
    status: null,
    error_code: null,
    error_message: null,
    num_media: null,
    media_urls: null,
    date_sent: '2026-04-20T11:00:00Z',
    team_id: 1,
    player_id: 1,
    category: 'chat',
    ingested_at: '2026-04-20T11:00:00Z',
    ...over,
  } as TwilioMessage;
}

describe('buildTimeline', () => {
  it('returns empty array when both inputs empty', () => {
    expect(buildTimeline([], [])).toEqual([]);
  });

  it('maps a workout activity_log to a workout entry', () => {
    const out = buildTimeline([log({ id: 5, kind: 'workout', description: '45 min freestyle', logged_at: '2026-04-20T07:30:00Z' })], []);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'log:5',
      kind: 'workout',
      ts: '2026-04-20T07:30:00Z',
      body: '45 min freestyle',
    });
  });

  it('maps a rehab activity_log to a rehab entry', () => {
    const out = buildTimeline([log({ id: 6, kind: 'rehab', description: 'knee mobility' })], []);
    expect(out[0].kind).toBe('rehab');
  });

  it('maps inbound chat message to inbound entry', () => {
    const out = buildTimeline([], [msg({ sid: 'A1', direction: 'inbound', category: 'chat', body: 'thanks coach' })]);
    expect(out[0]).toMatchObject({ id: 'msg:A1', kind: 'inbound', body: 'thanks coach' });
  });

  it('maps outbound chat message to outbound entry', () => {
    const out = buildTimeline([], [msg({ sid: 'A2', direction: 'outbound', category: 'chat' })]);
    expect(out[0].kind).toBe('outbound');
  });

  it('maps survey-category message to survey entry regardless of direction', () => {
    const out = buildTimeline([], [msg({ sid: 'A3', direction: 'inbound', category: 'survey', body: '7/10 ok' })]);
    expect(out[0].kind).toBe('survey');
  });

  it('maps workout-category message to workout entry', () => {
    const out = buildTimeline([], [msg({ sid: 'A4', direction: 'inbound', category: 'workout', body: '60 min' })]);
    expect(out[0].kind).toBe('workout');
  });

  it('maps rehab-category message to rehab entry', () => {
    const out = buildTimeline([], [msg({ sid: 'A5', direction: 'inbound', category: 'rehab', body: 'mobility' })]);
    expect(out[0].kind).toBe('rehab');
  });

  it('interleaves activity_logs and messages by ts desc', () => {
    const logs = [
      log({ id: 1, logged_at: '2026-04-20T08:00:00Z', description: 'a' }),
      log({ id: 2, logged_at: '2026-04-20T12:00:00Z', description: 'b' }),
    ];
    const msgs = [
      msg({ sid: 'X', date_sent: '2026-04-20T10:00:00Z' }),
      msg({ sid: 'Y', date_sent: '2026-04-20T14:00:00Z' }),
    ];
    const out = buildTimeline(logs, msgs);
    expect(out.map((e) => e.id)).toEqual(['msg:Y', 'log:2', 'msg:X', 'log:1']);
  });

  it('skips hidden activity_logs', () => {
    const out = buildTimeline([log({ id: 9, hidden: true })], []);
    expect(out).toEqual([]);
  });

  it('exposes original direction on message entries via meta', () => {
    const out = buildTimeline([], [msg({ sid: 'D1', direction: 'outbound', category: 'survey' })]);
    expect(out[0].meta).toMatchObject({ direction: 'outbound' });
  });

  it('dedupes: drops the source SMS when an activity_log was derived from it', () => {
    const logs = [log({ id: 7, kind: 'workout', description: 'leg day', source_sid: 'SM_abc' })];
    const msgs = [
      msg({ sid: 'SM_abc', category: 'workout', body: 'Workout: leg day' }),
      msg({ sid: 'SM_other', category: 'chat', body: 'thanks coach' }),
    ];
    const out = buildTimeline(logs, msgs);
    expect(out.map((e) => e.id).sort()).toEqual(['log:7', 'msg:SM_other']);
  });

  it('dedupes by content fingerprint + time when source_sid is missing', () => {
    // Legacy rows: the activity_log has no source_sid (e.g. came from
    // a sync from the old reflect DB), but the inbound SMS has the
    // same body and a near-identical timestamp.
    const logs = [
      log({
        id: 11,
        kind: 'workout',
        description: 'Lift: Push 10 min warm up 3x8 incline dumbell',
        logged_at: '2026-04-10T17:00:00Z',
        source_sid: null,
      }),
    ];
    const msgs = [
      msg({
        sid: 'SM_unsourced',
        category: 'workout',
        body: 'Lift: Push 10 min warm up 3x8 incline dumbell',
        date_sent: '2026-04-10T17:00:30Z', // 30 sec later
      }),
      msg({
        sid: 'SM_other',
        category: 'chat',
        body: 'thanks coach',
        date_sent: '2026-04-10T18:00:00Z',
      }),
    ];
    const out = buildTimeline(logs, msgs);
    expect(out.map((e) => e.id).sort()).toEqual(['log:11', 'msg:SM_other']);
  });

  it('does NOT dedupe when fingerprints match but timestamps are far apart', () => {
    const logs = [
      log({
        id: 12,
        kind: 'workout',
        description: 'leg day',
        logged_at: '2026-04-10T08:00:00Z',
        source_sid: null,
      }),
    ];
    const msgs = [
      msg({
        sid: 'SM_far',
        category: 'workout',
        body: 'Workout: leg day',
        date_sent: '2026-04-15T08:00:00Z', // 5 days later — different event
      }),
    ];
    const out = buildTimeline(logs, msgs);
    expect(out.map((e) => e.id).sort()).toEqual(['log:12', 'msg:SM_far']);
  });

  it('strips the "Workout:" / "Rehab:" SMS protocol prefix from log bodies', () => {
    const out = buildTimeline(
      [
        log({ id: 1, kind: 'workout', description: 'Workout: leg day' }),
        log({ id: 2, kind: 'rehab', description: 'rehab:  knee mobility' }),
      ],
      [],
    );
    expect(out.find((e) => e.id === 'log:1')?.body).toBe('leg day');
    expect(out.find((e) => e.id === 'log:2')?.body).toBe('knee mobility');
  });
});
