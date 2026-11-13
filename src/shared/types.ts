export type SignalCategory =
  | 'pain_point'
  | 'demand_signal'
  | 'feature_request'
  | 'pricing_concern'
  | 'competitor_activity'
  | 'irrelevant';

export const SIGNAL_CATEGORIES: SignalCategory[] = [
  'pain_point',
  'demand_signal',
  'feature_request',
  'pricing_concern',
  'competitor_activity',
  'irrelevant',
];

export const CATEGORY_LABELS: Record<SignalCategory, string> = {
  pain_point: 'Pain Point',
  demand_signal: 'Demand Signal',
  feature_request: 'Feature Request',
  pricing_concern: 'Pricing Concern',
  competitor_activity: 'Competitor Activity',
  irrelevant: 'Irrelevant',
};

export type LlmProvider = 'auto' | 'gemini' | 'groq';

export type PipelinePhase =
  | 'idle'
  | 'discover'
  | 'crawl'
  | 'clean'
  | 'analyze'
  | 'group'
  | 'rank'
  | 'briefs'
  | 'done'
  | 'error';

export interface CrawlLogEntry {
  id: string;
  timestamp: string;
  url: string;
  domain: string;
  status: 'discovered' | 'crawled' | 'skipped' | 'failed' | 'analyzed' | 'info';
  reason?: string;
  phase: PipelinePhase;
}

export interface CrawledPage {
  url: string;
  normalizedUrl: string;
  domain: string;
  title: string;
  crawl_date: string;
  publish_date?: string;
  main_text: string;
  char_count: number;
}

export interface EvidenceContext {
  before: string;
  match: string;
  after: string;
}

export interface FormulaWeights {
  frequency: number;
  relevance: number;
  urgency: number;
  confidence: number;
  recency: number;
}

export const DEFAULT_FORMULA_WEIGHTS: FormulaWeights = {
  frequency: 0.3,
  relevance: 0.25,
  urgency: 0.2,
  confidence: 0.15,
  recency: 0.1,
};

export interface Finding {
  id: string;
  category: SignalCategory;
  theme: string;
  summary: string;
  who: string;
  evidence: string;
  evidence_verified: boolean;
  evidence_context?: EvidenceContext;
  relevance: number;
  urgency: number;
  confidence: number;
  reasoning: string;
  source_url: string;
  domain: string;
  title: string;
  crawl_date: string;
  publish_date?: string;
  error?: string;
}

export interface ThemeScoreBreakdown {
  theme: string;
  theme_score: number;
  frequency: number;
  avg_relevance: number;
  avg_urgency: number;
  avg_confidence: number;
  recency: number;
  distinct_domains: number;
  verified_finding_count: number;
  unverified_finding_count: number;
}

export interface BriefEvidenceItem {
  excerpt: string;
  source_url: string;
}

export interface OpportunityBrief {
  theme: string;
  theme_score: number;
  title: string;
  what_is_happening: string;
  why_now: string;
  business_angle: string;
  evidence: BriefEvidenceItem[];
  next_step: string;
  caveats: string;
}

export interface RunStats {
  discovered_count: number;
  crawled_count: number;
  skipped_count: number;
  failed_count: number;
  cleaned_count: number;
  domains_count: number;
  useful_signals_count: number;
  irrelevant_count: number;
  unverified_count: number;
  themes_count: number;
}

export interface SignalRun {
  id: string;
  created_at: string;
  topic: string;
  keywords: string;
  seed_urls: string[];
  max_pages: number;
  llm_provider?: LlmProvider;
  is_sample: boolean;
  status: 'running' | 'completed' | 'failed';
  phase: PipelinePhase;
  progress: number;
  warnings: string[];
  error?: string;
  stats: RunStats;
  logs: CrawlLogEntry[];
  findings: Finding[];
  themes: ThemeScoreBreakdown[];
  briefs: OpportunityBrief[];
}

export interface RunSummary {
  id: string;
  created_at: string;
  topic: string;
  keywords: string;
  is_sample: boolean;
  status: 'running' | 'completed' | 'failed';
  useful_signals_count: number;
  crawled_count: number;
  domains_count: number;
}
