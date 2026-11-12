import type { ScoredFixture, LocalStatus } from './types';
export declare function shouldAutoDraft(item: ScoredFixture | undefined, status: LocalStatus | undefined, options?: { hasKey?: boolean; isDemo?: boolean; attempted?: boolean }): boolean;
