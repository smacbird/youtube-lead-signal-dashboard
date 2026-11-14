import React, { useState } from 'react';
import { apiJson } from './api';
import type { NicheProfile } from './types';
import { NICHES, NICHE_GROUPS } from './helpers';

type VolumeResult = { candidates: number; topical: number; engaged10: number; engaged50: number; commentSupply: number; sampledVideos: number; sampledComments: number; helpRequests: number; good: number; best: number; estimatedQuotaUnits: number; calls: { search: number; videos: number; commentPages: number }; query: string; daysBack: number; errors: Array<{ message: string }> };

export function NichePicker({ value, enabled, onChange, daysBack }: { value: NicheProfile; enabled: NicheProfile[]; onChange: (niche: NicheProfile) => void; daysBack: number }) {
  const [busy, setBusy] = useState<NicheProfile | null>(null);
  const [results, setResults] = useState<Partial<Record<NicheProfile, VolumeResult>>>({});
  const [errors, setErrors] = useState<Partial<Record<NicheProfile, string>>>({});
  const [openResults, setOpenResults] = useState<Partial<Record<NicheProfile, boolean>>>({});
  async function check(niche: NicheProfile) {
    setBusy(niche);
    setOpenResults((previous) => ({ ...previous, [niche]: true }));
    setErrors((previous) => ({ ...previous, [niche]: '' }));
    try {
      const result = await apiJson('/api/volume-check', { method: 'POST', body: JSON.stringify({ profileId: niche, daysBack }) }) as VolumeResult;
      setResults((previous) => ({ ...previous, [niche]: result }));
    } catch (error) {
      setErrors((previous) => ({ ...previous, [niche]: error instanceof Error ? error.message : 'Volume check failed.' }));
    } finally { setBusy(null); }
  }
  // One radio group (shared name) keeps arrow-key navigation working across both
  // sections; the group headings are visual only so screen readers still hear a
  // single "What kind of person are you looking for?" choice list.
  return (
    <fieldset className="niche-grid">
      <legend className="visually-hidden">What kind of person are you looking for?</legend>
      {NICHE_GROUPS.map((group) => {
        const cards = NICHES.filter((niche) => niche.group === group.key && enabled.includes(niche.id));
        if (!cards.length) return null;
        return (
          <React.Fragment key={group.key}>
            <p className="niche-group-label">{group.title}</p>
            {cards.map((niche) => (
              <div key={niche.id} className="niche-card-wrap">
                <label className={value === niche.id ? 'niche-card selected' : 'niche-card'}>
                  <input type="radio" name="niche" value={niche.id} checked={value === niche.id} onChange={() => onChange(niche.id)} />
                  <strong><span className="choice-indicator" aria-hidden="true">{value === niche.id ? '✓' : ''}</span>{niche.label}</strong>
                  <span className="choice-description">{niche.finds}</span>
                </label>
                <button id={`volume-toggle-${niche.id}`} type="button" className="link-button volume-button" disabled={busy !== null} onClick={() => results[niche.id] ? setOpenResults((previous) => ({ ...previous, [niche.id]: true })) : check(niche.id)} aria-controls={`volume-results-${niche.id}`} aria-expanded={Boolean(openResults[niche.id])} aria-describedby={`volume-quota-${niche.id}`}>{busy === niche.id ? 'Checking…' : results[niche.id] ? 'View comment activity' : 'Check comment activity'}</button>
                <small id={`volume-quota-${niche.id}`} className="volume-quota">{results[niche.id] ? 'Saved result. Viewing it uses no quota.' : 'Estimate: up to 103 YouTube units per check.'}</small>
                <div id={`volume-results-${niche.id}`} className="volume-result" role="region" aria-label={`Comment activity for ${niche.label}`} hidden={!openResults[niche.id]}>
                  {errors[niche.id] && <span role="status">{errors[niche.id]}{results[niche.id] ? ' Showing the previous result.' : ''}</span>}
                  {results[niche.id] && (() => { const r = results[niche.id]!; return <>
                    <strong role="status">{r.topical} topically matched of {r.candidates} distinct videos · {r.engaged10} have 10+ comments · {r.engaged50} have 50+</strong>
                    <span>Sample: {r.sampledComments} comments from {r.sampledVideos} videos. {r.helpRequests} possible help requests; {r.good} Good, {r.best} Best by current scoring.</span>
                    <span>Sample only, not a lead forecast. Estimated cost: {r.estimatedQuotaUnits} YouTube units. No leads saved.</span>
                    <details className="volume-details"><summary>How this check works</summary>
                      <span>Video counts indicate about {r.commentSupply.toLocaleString()} public comments, not how many recent comments are readable. Search: “{r.query}” over {r.daysBack} days of videos. The newest comment pages have no comment-age cutoff; Step 3 has its own filter.</span>
                      <span>Topical matches use keyword rules. This small sample is not representative. Requests: {r.calls.search} search, {r.calls.videos} video lookup, {r.calls.commentPages} comment pages. No retries; final YouTube billing may differ.</span>
                    </details>
                    {r.errors.map((error, index) => <span key={index}>Incomplete sample: {error.message}</span>)}
                    <button type="button" className="link-button volume-button" disabled={busy !== null} onClick={() => check(niche.id)}>Check again</button>
                    <small>Estimate: up to 103 YouTube units for another check.</small>
                  </>; })()}
                  {(results[niche.id] || errors[niche.id]) && <button type="button" className="link-button volume-button" onClick={() => { setOpenResults((previous) => ({ ...previous, [niche.id]: false })); document.getElementById(`volume-toggle-${niche.id}`)?.focus(); }}>Close results</button>}
                </div>
              </div>
            ))}
          </React.Fragment>
        );
      })}
    </fieldset>
  );
}
