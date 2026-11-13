import test from 'node:test';
import assert from 'node:assert/strict';
import type { Finding } from '../shared/types.ts';
import { filterAndSortFindings, matchesSignalKeywords, parseSearchKeywords } from './signalFilters.ts';

const SAMPLE: Finding[] = [
  {
    id: '1',
    category: 'pain_point',
    theme: 'Apartment Society (RWA) Approvals',
    summary: 'Managing committees reject 7.4kW wallbox installations.',
    who: 'Apartment-dwelling EV buyers in Wakad',
    evidence: 'committee rejected my basement wallbox',
    evidence_verified: true,
    relevance: 95,
    urgency: 85,
    confidence: 90,
    reasoning: 'Direct report',
    source_url: 'https://team-bhp.com/1',
    domain: 'team-bhp.com',
    title: 'RWA Thread',
    crawl_date: '2026-11-10T00:00:00Z',
  },
  {
    id: '2',
    category: 'demand_signal',
    theme: 'Two-Wheeler & Delivery Rider Hubs',
    summary: 'Delivery scooters lack safe midday top-up sockets.',
    who: 'Swiggy and Zomato gig riders',
    evidence: 'riders crowd outside tea stalls',
    evidence_verified: true,
    relevance: 91,
    urgency: 87,
    confidence: 84,
    reasoning: 'Local news',
    source_url: 'https://punekarnews.in/2',
    domain: 'punekarnews.in',
    title: 'Rider Hubs',
    crawl_date: '2026-11-10T00:00:00Z',
  },
];

test('parseSearchKeywords splits whitespace and commas cleanly', () => {
  assert.deepEqual(parseSearchKeywords('  wakad,  wallbox  '), ['wakad', 'wallbox']);
  assert.deepEqual(parseSearchKeywords('   '), []);
});

test('matchesSignalKeywords searches across summary, who, and theme fields', () => {
  // Matches summary + who across separate fields
  assert.equal(matchesSignalKeywords(SAMPLE[0], ['wallbox', 'wakad']), true);
  // Matches theme + who
  assert.equal(matchesSignalKeywords(SAMPLE[1], ['delivery', 'swiggy']), true);
  // Does not match non-existent term
  assert.equal(matchesSignalKeywords(SAMPLE[0], ['swiggy']), false);
});

test('filterAndSortFindings filters by keywords and preserves other filters and sort', () => {
  const res = filterAndSortFindings(SAMPLE, {
    categoryFilter: 'all',
    themeFilter: 'all',
    domainFilter: 'all',
    minScore: 0,
    searchQuery: 'gig hubs',
    sortField: 'relevance',
    sortDir: 'desc',
  });
  assert.equal(res.length, 1);
  assert.equal(res[0].id, '2');
});
