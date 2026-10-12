export { LearningEngine } from './learning-engine';
export { ProtectiveFilter } from './protective-filter';
export { EvolutionTracker } from './evolution-tracker';

export const EVOLUTION_LEVELS = [
  { level: 1,  name: 'Novice',           minMaturity: 0,   minKnowledge: 0 },
  { level: 2,  name: 'Learner',          minMaturity: 10,  minKnowledge: 5 },
  { level: 3,  name: 'Apprentice',       minMaturity: 20,  minKnowledge: 15 },
  { level: 4,  name: 'Practitioner',     minMaturity: 30,  minKnowledge: 30 },
  { level: 5,  name: 'Specialist',       minMaturity: 40,  minKnowledge: 50 },
  { level: 6,  name: 'Expert',           minMaturity: 55,  minKnowledge: 75 },
  { level: 7,  name: 'Master',           minMaturity: 70,  minKnowledge: 100 },
  { level: 8,  name: 'Authority',        minMaturity: 82,  minKnowledge: 140 },
  { level: 9,  name: 'Pioneer',          minMaturity: 92,  minKnowledge: 180 },
  { level: 10, name: 'Industrial Model', minMaturity: 98, minKnowledge: 250 },
] as const;

export type EvolutionLevel = (typeof EVOLUTION_LEVELS)[number];

export const KNOWLEDGE_CATEGORIES = [
  'domain', 'pattern', 'correction', 'strategy', 'tool_usage', 'communication',
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

export const SAFETY_LEVELS = ['minimal', 'standard', 'strict', 'maximum'] as const;
export type SafetyLevel = (typeof SAFETY_LEVELS)[number];

export const EVOLUTION_PATHS = ['specialist', 'generalist', 'hybrid', 'industrial'] as const;
export type EvolutionPath = (typeof EVOLUTION_PATHS)[number];
