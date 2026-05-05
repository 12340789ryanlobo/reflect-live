'use client';

// A small, ordered "needs attention" list that fades + slides each
// row in once the section enters the viewport. Used only on the
// landing page's dashboard preview — the real /dashboard's
// NeedsAttention component renders all rows immediately, since it's
// reading live data and the staggered entrance would feel slow there.

import { motion, type Variants } from 'motion/react';

interface Row {
  name: string;
  tag: string;
  tone: 'amber' | 'red';
}

interface Props {
  rows: Row[];
}

const containerVariants: Variants = {
  hidden: {},
  visible: {
    // delayChildren: wait this long after the section enters the
    // viewport before the first row starts animating. Combined with
    // viewport.amount=0.7 below, the staggered entrance only fires
    // once the user is actually parked on this part of the page,
    // not the moment a single pixel scrolls into view.
    transition: { staggerChildren: 0.22, delayChildren: 0.45 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 320, damping: 30 },
  },
};

export function AttentionList({ rows }: Props) {
  return (
    <motion.ul
      className="space-y-2 text-[13px]"
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      // amount: 0.7 means 70% of the list rect needs to be visible
      // before the entrance fires. Bumped from the prior margin-based
      // trigger because a -50px margin still fired the moment the row
      // peeked above the fold; this waits until the user scrolls past
      // the dashboard preview and the list is genuinely on-screen.
      viewport={{ once: true, amount: 0.7 }}
    >
      {rows.map((r) => {
        const dotColor = r.tone === 'red' ? 'var(--red)' : 'var(--amber)';
        return (
          <motion.li
            key={r.name}
            variants={itemVariants}
            className="flex items-center justify-between gap-3 py-1"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="size-1.5 rounded-full shrink-0" style={{ background: dotColor }} aria-hidden />
              <span className="font-semibold text-[color:var(--ink)]">{r.name}</span>
              <span className="text-[12px] text-[color:var(--ink-mute)] truncate">{r.tag}</span>
            </div>
            <span className="text-[10.5px] uppercase tracking-wide font-bold text-[color:var(--ink-mute)]">quiet</span>
          </motion.li>
        );
      })}
    </motion.ul>
  );
}
