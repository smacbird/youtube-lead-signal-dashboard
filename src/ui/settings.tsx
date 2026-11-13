import React from 'react';
import type { AppSettings, HealthConfig } from './types';
import { keyWarnings } from './keyWarnings';
import { SCAN_PRESETS } from './scanPresets.js';
import { NICHES } from './helpers';

export function SettingsPanel({ settings, status, health, onChange, onClose }: { settings: AppSettings; status: string; health: HealthConfig; onChange: (next: AppSettings) => void; onClose: () => void }) {
  return (
    <section id="settings-panel" className="settings-panel" aria-labelledby="settings-title">
      <div className="section-heading-row">
        <div>
          <h2 id="settings-title">Settings</h2>
          <p>These choices are saved on this service and used for your next visit. They never change or delete saved scans.</p>
        </div>
        <button type="button" className="header-button" onClick={onClose}>Close</button>
      </div>
      <div className="settings-grid">
        <label>
          <span>Default scan size</span>
          <select value={settings.defaultScanDepth} onChange={(event) => onChange({ ...settings, defaultScanDepth: Number(event.target.value) })}>
            {SCAN_PRESETS.map((preset) => <option key={preset.id} value={preset.videos}>{preset.label} · {preset.videos} videos</option>)}
          </select>
        </label>
        <label>
          <span>Default video age</span>
          <select value={settings.defaultFreshnessDays} onChange={(event) => onChange({ ...settings, defaultFreshnessDays: Number(event.target.value) })}>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days (recommended)</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
        <label>
          <span>Reply tone</span>
          <input value={settings.replyTone} onChange={(event) => onChange({ ...settings, replyTone: event.target.value })} />
        </label>
      </div>
      <fieldset className="settings-niches">
        <legend>Niches shown in Step 1</legend>
        {NICHES.map((niche) => {
          const checked = settings.enabledNiches.includes(niche.id);
          return <label key={niche.id}>
            <input type="checkbox" checked={checked} disabled={checked && settings.enabledNiches.length === 1}
              onChange={() => onChange({ ...settings, enabledNiches: checked
                ? settings.enabledNiches.filter((id) => id !== niche.id)
                : [...settings.enabledNiches, niche.id] })} />
            <span>{niche.label}</span>
          </label>;
        })}
      </fieldset>
      <p role="status" aria-live="polite" className="workflow-note">{status}</p>
      <div className="key-health-notes">
        <h3>Last-known API status</h3>
        <p className="workflow-note">Based on actual requests, not an active key test. A restart resets this status to unknown.</p>
        {keyWarnings(health).length ? <ul>{keyWarnings(health).map((warning) => <li key={warning}>{warning}</li>)}</ul>
          : <p className="workflow-note">No API key warnings from recent requests.</p>}
      </div>
    </section>
  );
}
