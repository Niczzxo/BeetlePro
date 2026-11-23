'use client';

import type { ReactNode } from 'react';
import type { UiError } from '../lib/api';

/** Small shared building blocks for the admin pages, styled with
 * the classes in globals.css and the Dostelo design tokens. */

export function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {children}
    </div>
  );
}

export function LoadingNote({ label = 'Loading...' }: { label?: string }) {
  return <p className="note muted">{label}</p>;
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="note muted">{children}</p>;
}

export function ErrorNote({
  error,
  onRetry,
}: {
  error: UiError;
  onRetry?: () => void;
}) {
  return (
    <div className="note error-note" role="alert">
      <span>{error.message}</span>
      {onRetry && error.kind !== 'forbidden' ? (
        <button type="button" className="btn btn-small" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="card stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note ? <div className="stat-note">{note}</div> : null}
    </div>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}
