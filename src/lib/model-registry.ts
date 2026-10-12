/**
 * Centralized AI Model Registry
 * Single source of truth for all model definitions.
 * Import from here instead of duplicating DEFAULT_MODELS arrays.
 */

export interface AIModel {
  id: string;
  name: string;
  family: string;
  provider: string;
  maxContext: number;
  capabilities: string[];
}

export const AI_MODELS: AIModel[] = [
  {
    id: 'deepseek-v3',
    name: 'DeepSeek V3',
    family: 'deepseek',
    provider: 'local',
    maxContext: 64000,
    capabilities: ['code_generation', 'analysis', 'conversation', 'data_processing', 'creative'],
  },
  {
    id: 'deepseek-r1',
    name: 'DeepSeek R1',
    family: 'deepseek',
    provider: 'local',
    maxContext: 64000,
    capabilities: ['analysis', 'creative', 'conversation', 'reasoning'],
  },
  {
    id: 'llama-3-70b',
    name: 'LLaMA 3 70B',
    family: 'llama',
    provider: 'local',
    maxContext: 70000,
    capabilities: ['code_generation', 'analysis', 'conversation', 'data_processing', 'creative'],
  },
  {
    id: 'llama-3.1-70b',
    name: 'LLaMA 3.1 70B',
    family: 'llama',
    provider: 'local',
    maxContext: 131072,
    capabilities: ['code_generation', 'analysis', 'conversation', 'data_processing', 'creative'],
  },
  {
    id: 'gemma-3-27b',
    name: 'Gemma 3 27B',
    family: 'gemma',
    provider: 'local',
    maxContext: 131072,
    capabilities: ['analysis', 'conversation', 'creative', 'data_processing'],
  },
  {
    id: 'qwen-3-235b-a22b',
    name: 'Qwen 3 235B-A22B',
    family: 'qwen',
    provider: 'local',
    maxContext: 131072,
    capabilities: ['code_generation', 'analysis', 'conversation', 'data_processing', 'creative'],
  },
];
