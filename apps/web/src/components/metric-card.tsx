'use client';

import * as React from 'react';
import { StatCell, type StatTone } from './v3/stat-cell';

export type MetricTone = 'default' | 'primary' | 'success' | 'warning' | 'danger';

const MAP: Record<MetricTone, StatTone> = {
  default: 'default',
  primary: 'blue',
  success: 'green',
  warning: 'amber',
  danger: 'red',
};

/**
 * Compat wrapper. Existing pages use `<Metric>`; new pages prefer `<StatCell>` directly.
 */
export function Metric({
  label,
  value,
  sub,
  tone = 'default',
  icon: _icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: MetricTone;
  icon?: React.ReactNode;
  spark?: number[];
}) {
  return <StatCell label={label} value={value} sub={sub} tone={MAP[tone]} />;
}
