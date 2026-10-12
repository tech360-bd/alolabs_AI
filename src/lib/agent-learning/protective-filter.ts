type SafetyLevel = 'minimal' | 'standard' | 'strict' | 'maximum';
type LearningScope = 'task_domain' | 'cross_domain' | 'open' | 'restricted';

/**
 * Protective Filter: Ensures all learned content passes safety checks.
 * Blocks harmful, toxic, PII-leaking, or off-scope content before it
 * enters the agent's knowledge base.
 */
export class ProtectiveFilter {
  // Patterns that should ALWAYS be blocked regardless of safety level
  private readonly hardBlockPatterns: RegExp[] = [
    /password\s*[:=]/i,
    /api[_-]?key\s*[:=]/i,
    /secret[_-]?key\s*[:=]/i,
    /token\s*[:=]\s*['"][a-zA-Z0-9]{20,}/i,
    /Bearer\s+[a-zA-Z0-9\-._~+/]+=*/i,
    /credit\s*card\s*\d/i,
    /ssn\s*\d{3}[-\s]?\d{2}[-\s]?\d{4}/i,
  ];

  // Patterns blocked at 'standard' and above
  private readonly standardBlockPatterns: RegExp[] = [
    /(?:hack|exploit|bypass|inject|overflow|malware|phishing|ransomware)/i,
    /(?:kill\s+process|rm\s+-rf|drop\s+table|truncate\s+table)/i,
  ];

  // Patterns blocked at 'strict' and above
  private readonly strictBlockPatterns: RegExp[] = [
    /(?:racial|ethnic|religious|gender|sexual)\s*(?:slur|discriminat|hatred)/i,
    /(?:self.?(?:harm|injur|kill|destruct))/i,
    /(?:violence|abuse|threat|harass|stalk)/i,
  ];

  /**
   * Filter content through protective rules.
   * Returns only content that passes all checks.
   */
  filter(
    content: string[],
    safetyLevel: SafetyLevel,
    learningScope: LearningScope,
    allowedDomains: string[],
    blockedPatterns: string[],
  ): string[] {
    if (safetyLevel === 'minimal') {
      return content.filter(c => this.checkHardBlocks(c));
    }

    return content.filter(c => {
      if (!this.checkHardBlocks(c)) return false;
      if (!this.checkStandardBlocks(c)) return false;
      if (safetyLevel === 'strict' || safetyLevel === 'maximum') {
        if (!this.checkStrictBlocks(c)) return false;
      }
      if (safetyLevel === 'maximum') {
        if (!this.checkMaximumBlocks(c)) return false;
      }
      if (blockedPatterns.length > 0 && !this.checkCustomBlocks(c, blockedPatterns)) {
        return false;
      }
      if (learningScope === 'restricted' && !this.checkScopeRestriction(c, allowedDomains)) {
        return false;
      }
      return true;
    });
  }

  /**
   * Score a single piece of content for safety (0-100).
   * Higher = safer.
   */
  safetyScore(content: string): number {
    let score = 100;
    for (const p of this.hardBlockPatterns) {
      if (p.test(content)) score -= 100;
    }
    for (const p of this.standardBlockPatterns) {
      if (p.test(content)) score -= 40;
    }
    for (const p of this.strictBlockPatterns) {
      if (p.test(content)) score -= 30;
    }
    return Math.max(0, score);
  }

  /**
   * Check if a specific piece of content violates any rule.
   */
  isViolation(content: string, safetyLevel: SafetyLevel = 'standard'): boolean {
    const result = this.filter([content], safetyLevel, 'task_domain', [], []);
    return result.length === 0;
  }

  // ── Private checks ──────────────────────────────────────────

  private checkHardBlocks(content: string): boolean {
    return !this.hardBlockPatterns.some(p => p.test(content));
  }

  private checkStandardBlocks(content: string): boolean {
    return !this.standardBlockPatterns.some(p => p.test(content));
  }

  private checkStrictBlocks(content: string): boolean {
    return !this.strictBlockPatterns.some(p => p.test(content));
  }

  private checkMaximumBlocks(content: string): boolean {
    // Maximum: also block anything too short (likely noise) or too long (likely injected data)
    if (content.length < 5 || content.length > 5000) return false;
    // Block high-frequency repetitive patterns (possible injection)
    const words = content.split(/\s+/);
    const uniqueWords = new Set(words);
    if (words.length > 10 && uniqueWords.size / words.length < 0.3) return false;
    return true;
  }

  private checkCustomBlocks(content: string, patterns: string[]): boolean {
    return !patterns.some(p => {
      try {
        return new RegExp(p, 'i').test(content);
      } catch {
        return content.toLowerCase().includes(p.toLowerCase());
      }
    });
  }

  private checkScopeRestriction(content: string, allowedDomains: string[]): boolean {
    if (allowedDomains.length === 0) return true;
    const lower = content.toLowerCase();
    return allowedDomains.some(domain => lower.includes(domain.toLowerCase()));
  }
}
