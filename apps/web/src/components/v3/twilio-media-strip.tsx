'use client';

// Inline thumbnail strip for an activity_log row. Renders up to N
// small square thumbnails; if more, surfaces a '+M' overflow chip.
// Click any thumbnail → lightbox modal that shows the full image
// with arrows to flip through the rest.
//
// Each thumbnail src is `/api/twilio-media/<messageSid>/<mediaSid>`,
// which auths and proxies through Twilio. The browser caches each
// image for 24h via the proxy's response header.

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface Props {
  /** The Twilio message SID this activity row was sourced from. */
  messageSid: string | null;
  /** Twilio Media SIDs attached to that message. */
  mediaSids: string[] | null;
  /** Max thumbnails rendered inline; rest collapse into '+N'. */
  maxInline?: number;
  /** Optional className on the outer flex container. */
  className?: string;
}

export function TwilioMediaStrip({
  messageSid,
  mediaSids,
  maxInline = 3,
  className,
}: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  if (!messageSid || !mediaSids || mediaSids.length === 0) return null;

  const inlineCount = Math.min(maxInline, mediaSids.length);
  const inline = mediaSids.slice(0, inlineCount);
  const overflow = mediaSids.length - inlineCount;

  function urlFor(idx: number): string {
    return `/api/twilio-media/${messageSid}/${mediaSids![idx]}`;
  }

  return (
    <>
      <div className={`flex items-center gap-1.5 shrink-0 ${className ?? ''}`}>
        {inline.map((_sid, i) => (
          <button
            key={i}
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpenIdx(i); }}
            aria-label={`View attachment ${i + 1}`}
            className="size-9 rounded-md overflow-hidden border bg-[color:var(--paper-2)] hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[color:var(--blue)]"
            style={{ borderColor: 'var(--border)' }}
          >
            <img
              src={urlFor(i)}
              alt=""
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
            />
          </button>
        ))}
        {overflow > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpenIdx(inlineCount); }}
            aria-label={`View ${overflow} more attachment${overflow === 1 ? '' : 's'}`}
            className="grid size-9 place-items-center rounded-md border bg-[color:var(--paper-2)] text-[11px] font-bold text-[color:var(--ink-soft)] hover:bg-[color:var(--paper)] focus:outline-none focus:ring-2 focus:ring-[color:var(--blue)]"
            style={{ borderColor: 'var(--border)' }}
          >
            +{overflow}
          </button>
        )}
      </div>

      <Dialog
        open={openIdx !== null}
        onOpenChange={(o) => { if (!o) setOpenIdx(null); }}
      >
        <DialogContent className="sm:max-w-3xl p-0 bg-[color:var(--ink)]">
          <DialogTitle className="sr-only">Attachment viewer</DialogTitle>
          {openIdx !== null && (
            <div className="relative flex items-center justify-center min-h-[40vh]">
              <img
                src={urlFor(openIdx)}
                alt=""
                className="max-h-[85vh] w-full object-contain"
              />
              {/* Close button — Dialog has its own X but we want a
                  visible one over the dark background too. */}
              <button
                type="button"
                onClick={() => setOpenIdx(null)}
                aria-label="Close"
                className="absolute top-3 right-3 grid size-9 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60"
              >
                <X className="size-5" />
              </button>
              {mediaSids.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setOpenIdx((i) => (i === null ? 0 : (i + mediaSids.length - 1) % mediaSids.length))}
                    aria-label="Previous"
                    className="absolute left-3 top-1/2 -translate-y-1/2 grid size-10 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenIdx((i) => (i === null ? 0 : (i + 1) % mediaSids.length))}
                    aria-label="Next"
                    className="absolute right-3 top-1/2 -translate-y-1/2 grid size-10 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                  <span className="absolute bottom-3 left-1/2 -translate-x-1/2 mono text-[11px] font-semibold tracking-wide text-white/80 bg-black/40 px-2 py-0.5 rounded">
                    {openIdx + 1} / {mediaSids.length}
                  </span>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
