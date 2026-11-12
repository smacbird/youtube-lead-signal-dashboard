import React from 'react';
import type { AppSettings } from './types';
import { SCAN_PRESETS } from './scanPresets.js';

export function SettingsPanel({ settings, onChange, onClose }: { settings: AppSettings; onChange: (next: AppSettings) => void; onClose: () => void }) {
  return (
    <section id="settings-panel" className="settings-panel" aria-labelledby="settings-title">
      <div className="section-heading-row">
        <div>
          <h2 id="settings-title">Settings</h2>
          <p>These set the starting choices for your next scan in this browser. They never change or delete saved scans.</p>
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
    </section>
  );
}
