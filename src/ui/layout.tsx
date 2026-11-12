import React from 'react';

export type StepState = 'done' | 'current' | 'upcoming';

export const STEPS = [
  { n: 1, title: 'Choose what you are looking for' },
  { n: 2, title: 'Run the scan' },
  { n: 3, title: 'Review your leads' },
  { n: 4, title: 'Reply' },
];

const stateText: Record<StepState, string> = { done: 'Done', current: 'You are here', upcoming: 'Next' };

export function AppHeader({ leadCount, onSettings, settingsOpen, onExport, exportDisabled, onSignOut }: { leadCount: number | null; onSettings: () => void; settingsOpen: boolean; onExport: () => void; exportDisabled: boolean; onSignOut: () => void }) {
  return (
    <header className="app-header">
      <div className="brand">
        <strong>The Best Lead System</strong>
        <span>Find people on YouTube asking for help, and reply to them yourself.</span>
      </div>
      {leadCount !== null && (
        <p className="header-leads" aria-live="polite"><strong>{leadCount}</strong> real prospect{leadCount === 1 ? '' : 's'} found</p>
      )}
      <nav className="header-menu" aria-label="Account and tools">
        <button type="button" className="header-button" aria-expanded={settingsOpen} aria-controls="settings-panel" onClick={onSettings}>Settings</button>
        <button type="button" className="header-button" onClick={onExport} disabled={exportDisabled} title={exportDisabled ? 'Run or load a scan first' : 'Download the comments shown in Step 3'}>Export CSV</button>
        <button type="button" className="header-button" onClick={onSignOut}>Sign out</button>
      </nav>
    </header>
  );
}

export function StepProgress({ states }: { states: StepState[] }) {
  return (
    <nav className="step-progress" aria-label="Your progress">
      <ol>
        {STEPS.map((step, index) => (
          <li key={step.n} className={`progress-step ${states[index]}`} aria-current={states[index] === 'current' ? 'step' : undefined}>
            <a href={`#step-${step.n}`}>
              <span className="progress-number" aria-hidden="true">{states[index] === 'done' ? '✓' : step.n}</span>
              <span className="progress-text">
                <strong>{step.title}</strong>
                <small>{stateText[states[index]]}</small>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function StepSection({ n, state, help, children, aside }: { n: number; state: StepState; help: string; children: React.ReactNode; aside?: React.ReactNode }) {
  const step = STEPS[n - 1];
  return (
    <section id={`step-${n}`} className={`step-section ${state}`} aria-labelledby={`step-${n}-title`}>
      <div className="step-heading">
        <div>
          <span className="step-badge">Step {n} of 4 · {stateText[state]}</span>
          <h2 id={`step-${n}-title`} tabIndex={-1}>{step.title}</h2>
          <p className="step-help">{help}</p>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function StatCard({ label, value, note, emphasis }: { label: string; value: string | number; note?: string; emphasis?: boolean }) {
  return (
    <div className={emphasis ? 'stat-card emphasis' : 'stat-card'}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
