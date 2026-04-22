'use client';

import * as React from 'react';
import { StatReadout, type ReadoutTone } from './stat-readout';

export type MetricTone = 'default' | 'primary' | 'success' | 'warning' | 'danger';

const TONE_MAP: Record<MetricTone, ReadoutTone> = {
  default: 'default',
  primary: 'heritage',
  success: 'chlorine',
  warning: 'amber',
  danger: 'siren',
};

/**
 * Legacy `<Metric>` alias — existing pages pass `tone="primary" | "success" | etc.`
 * We map those onto the new StatReadout tones so all pages inherit the new
 * editorial readout style without page-by-page rewrites.
 */
export function Metric({
  label,
  value,
  sub,
  tone = 'default',
  icon: _icon,
  spark,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: MetricTone;
  icon?: React.ReactNode;
  spark?: number[];
}) {
  return (
    <StatReadout
      label={label}
      value={value}
      sub={sub}
      tone={TONE_MAP[tone]}
      spark={spark}
    />
  );
}
