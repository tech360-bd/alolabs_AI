/**
 * seed-skills-v2.ts
 * Populates empty protocol fields for all 2,000 skills with realistic data.
 * Idempotent — safe to run multiple times.
 */
import { db } from '../src/lib/db';

// Category → tool/security/rule mappings
const CATEGORY_CONFIG: Record<string, {
  tools: string[];
  forbiddenTools: string[];
  validationRules: object;
  securityRules: object;
  costPolicy: object;
}> = {
  default: {
    tools: ['local_ai', 'memory_read', 'memory_write', 'file_output', 'web_search'],
    forbiddenTools: ['shell_unrestricted', 'secret_read', 'public_publish', 'database_delete'],
    validationRules: {
      inputSchema: 'strict',
      outputValidation: true,
      maxInputSize: '10MB',
      rateLimitPerMinute: 60,
      requiresAuthentication: true,
    },
    securityRules: {
      dataClassification: 'internal',
      encryptionRequired: true,
      auditLogging: true,
      retentionDays: 90,
      allowedNetworks: ['internal'],
    },
    costPolicy: {
      costPerExecution: 0.0,
      currency: 'USD',
      billingModel: 'included',
      monthlyQuota: 10000,
      overagePolicy: 'block',
    },
  },
};

// Category-specific overrides
const CAT_OVERRIDES: Record<string, Partial<typeof CATEGORY_CONFIG.default>> = {
  'Cybersecurity': {
    tools: ['network_scanner', 'log_analyzer', 'vulnerability_scanner', 'threat_intel_feed', 'incident_cli'],
    forbiddenTools: ['shell_unrestricted', 'public_publish', 'external_api_unrestricted'],
    validationRules: { inputSchema: 'strict', outputValidation: true, maxInputSize: '50MB', rateLimitPerMinute: 30, requiresAuthentication: true, requiresMFA: true },
    securityRules: { dataClassification: 'confidential', encryptionRequired: true, auditLogging: true, retentionDays: 365, allowedNetworks: ['internal', 'vpn'] },
    costPolicy: { costPerExecution: 0.05, currency: 'USD', billingModel: 'per_execution', monthlyQuota: 5000, overagePolicy: 'block' },
  },
  'Financial Analysis': {
    tools: ['financial_model', 'spreadsheet_reader', 'calculator', 'market_data_feed', 'report_generator'],
    forbiddenTools: ['shell_unrestricted', 'public_publish', 'external_api_unrestricted'],
    validationRules: { inputSchema: 'strict', outputValidation: true, maxInputSize: '20MB', rateLimitPerMinute: 20, requiresAuthentication: true, requiresApproval: true },
    securityRules: { dataClassification: 'confidential', encryptionRequired: true, auditLogging: true, retentionDays: 730, allowedNetworks: ['internal'] },
    costPolicy: { costPerExecution: 0.02, currency: 'USD', billingModel: 'per_execution', monthlyQuota: 8000, overagePolicy: 'alert' },
  },
  'HR Compliance': {
    tools: ['employee_db', 'document_generator', 'compliance_checker', 'notification_sender', 'report_generator'],
    forbiddenTools: ['shell_unrestricted', 'public_publish', 'external_share'],
    validationRules: { inputSchema: 'strict', outputValidation: true, maxInputSize: '10MB', rateLimitPerMinute: 30, requiresAuthentication: true, dataResidency: 'local' },
    securityRules: { dataClassification: 'confidential', encryptionRequired: true, auditLogging: true, retentionDays: 365, allowedNetworks: ['internal'], gdprCompliant: true },
    costPolicy: { costPerExecution: 0.0, currency: 'USD', billingModel: 'included', monthlyQuota: 5000, overagePolicy: 'block' },
  },
  'Content Strategy': {
    tools: ['web_search', 'content_analyzer', 'seo_checker', 'trend_analyzer', 'file_output'],
    forbiddenTools: ['shell_unrestricted', 'secret_read', 'database_delete'],
    validationRules: { inputSchema: 'standard', outputValidation: true, maxInputSize: '5MB', rateLimitPerMinute: 60, requiresAuthentication: true },
    securityRules: { dataClassification: 'internal', encryptionRequired: false, auditLogging: true, retentionDays: 90, allowedNetworks: ['internal', 'cdn'] },
    costPolicy: { costPerExecution: 0.01, currency: 'USD', billingModel: 'per_execution', monthlyQuota: 20000, overagePolicy: 'alert' },
  },
  'Software Engineering': {
    tools: ['code_executor', 'git_client', 'database_query', 'api_tester', 'lint_runner', 'file_output'],
    forbiddenTools: ['shell_unrestricted', 'production_deploy_unapproved', 'secret_read'],
    validationRules: { inputSchema: 'strict', outputValidation: true, maxInputSize: '10MB', rateLimitPerMinute: 40, requiresAuthentication: true, sandboxRequired: true },
    securityRules: { dataClassification: 'internal', encryptionRequired: true, auditLogging: true, retentionDays: 90, allowedNetworks: ['internal'] },
    costPolicy: { costPerExecution: 0.0, currency: 'USD', billingModel: 'included', monthlyQuota: 15000, overagePolicy: 'alert' },
  },
  'Frontend Development': {
    tools: ['code_executor', 'browser_automation', 'style_checker', 'accessibility_tester', 'file_output'],
    forbiddenTools: ['shell_unrestricted', 'production_deploy_unapproved', 'database_write'],
    validationRules: { inputSchema: 'standard', outputValidation: true, maxInputSize: '5MB', rateLimitPerMinute: 60, requiresAuthentication: true },
    securityRules: { dataClassification: 'internal', encryptionRequired: false, auditLogging: true, retentionDays: 60, allowedNetworks: ['internal'] },
    costPolicy: { costPerExecution: 0.0, currency: 'USD', billingModel: 'included', monthlyQuota: 20000, overagePolicy: 'block' },
  },
  'Backend Development': {
    tools: ['code_executor', 'database_query', 'api_tester', 'load_tester', 'file_output'],
    forbiddenTools: ['shell_unrestricted', 'production_deploy_unapproved', 'public_publish'],
    validationRules: { inputSchema: 'strict', outputValidation: true, maxInputSize: '10MB', rateLimitPerMinute: 40, requiresAuthentication: true, sandboxRequired: true },
    securityRules: { dataClassification: 'internal', encryptionRequired: true, auditLogging: true, retentionDays: 90, allowedNetworks: ['internal'] },
    costPolicy: { costPerExecution: 0.0, currency: 'USD', billingModel: 'included', monthlyQuota: 15000, overagePolicy: 'alert' },
  },
  'Mobile Development': {
    tools: ['code_executor', 'device_simulator', 'api_tester', 'build_tool', 'file_output'],
    forbiddenTools: ['shell_unrestricted', 'production_deploy_unapproved', 'secret_read'],
    validationRules: { inputSchema: 'strict', outputValidation: true, maxInputSize: '20MB', rateLimitPerMinute: 30, requiresAuthentication: true },
    securityRules: { dataClassification: 'internal', encryptionRequired: true, auditLogging: true, retentionDays: 90, allowedNetworks: ['internal'] },
    costPolicy: { costPerExecution: 0.0, currency: 'USD', billingModel: 'included', monthlyQuota: 10000, overagePolicy: 'block' },
  },
  'SEO': {
    tools: ['web_search', 'seo_checker', 'keyword_analyzer', 'rank_tracker', 'content_analyzer', 'report_generator'],
    forbiddenTools: ['shell_unrestricted', 'secret_read', 'database_write'],
    validationRules: { inputSchema: 'standard', outputValidation: true, maxInputSize: '5MB', rateLimitPerMinute: 60, requiresAuthentication: true },
    securityRules: { dataClassification: 'internal', encryptionRequired: false, auditLogging: true, retentionDays: 90, allowedNetworks: ['internal', 'external_api'] },
    costPolicy: { costPerExecution: 0.01, currency: 'USD', billingModel: 'per_execution', monthlyQuota: 25000, overagePolicy: 'alert' },
  },
  'Social Media': {
    tools: ['web_search', 'content_analyzer', 'social_api', 'scheduler', 'image_processor', 'report_generator'],
    forbiddenTools: ['shell_unrestricted', 'secret_read', 'database_delete'],
    validationRules: { inputSchema: 'standard', outputValidation: true, maxInputSize: '10MB', rateLimitPerMinute: 30, requiresAuthentication: true, requiresApproval: true },
    securityRules: { dataClassification: 'internal', encryptionRequired: true, auditLogging: true, retentionDays: 90, allowedNetworks: ['internal', 'social_apis'] },
    costPolicy: { costPerExecution: 0.02, currency: 'USD', billingModel: 'per_execution', monthlyQuota: 15000, overagePolicy: 'alert' },
  },
  'Video Production': {
    tools: ['video_encoder', 'image_processor', 'audio_processor', 'file_output', 'template_engine'],
    forbiddenTools: ['shell_unrestricted', 'secret_read', 'database_write'],
    validationRules: { inputSchema: 'standard', outputValidation: true, maxInputSize: '500MB', rateLimitPerMinute: 5, requiresAuthentication: true },
    securityRules: { dataClassification: 'internal', encryptionRequired: false, auditLogging: true, retentionDays: 30, allowedNetworks: ['internal'] },
    costPolicy: { costPerExecution: 0.05, currency: 'USD', billingModel: 'per_execution', monthlyQuota: 2000, overagePolicy: 'block' },
  },
  'Audio Production': {
    tools: ['audio_processor', 'tts_engine', 'stt_engine', 'file_output', 'template_engine'],
    forbiddenTools: ['shell_unrestricted', 'secret_read', 'database_write'],
    validationRules: { inputSchema: 'standard', outputValidation: true, maxInputSize: '100MB', rateLimitPerMinute: 10, requiresAuthentication: true },
    securityRules: { dataClassification: 'internal', encryptionRequired: false, auditLogging: true, retentionDays: 30, allowedNetworks: ['internal'] },
    costPolicy: { costPerExecution: 0.03, currency: 'USD', billingModel: 'per_execution', monthlyQuota: 3000, overagePolicy: 'block' },
  },
  'Graphic Design': {
    tools: ['image_processor', 'template_engine', 'color_palette', 'font_manager', 'file_output'],
    forbiddenTools: ['shell_unrestricted', 'secret_read', 'database_write', 'external_api_unrestricted'],
    validationRules: { inputSchema: 'standard', outputValidation: true, maxInputSize: '50MB', rateLimitPerMinute: 20, requiresAuthentication: true },
    securityRules: { dataClassification: 'internal', encryptionRequired: false, auditLogging: true, retentionDays: 60, allowedNetworks: ['internal'] },
    costPolicy: { costPerExecution: 0.02, currency: 'USD', billingModel: 'per_execution', monthlyQuota: 5000, overagePolicy: 'alert' },
  },
  'Recruitment': {
    tools: ['resume_parser', 'job_board_api', 'email_sender', 'calendar_integration', 'document_generator', 'report_generator'],
    forbiddenTools: ['shell_unrestricted', 'public_publish', 'database_delete'],
    validationRules: { inputSchema: 'strict', outputValidation: true, maxInputSize: '10MB', rateLimitPerMinute: 30, requiresAuthentication: true, dataResidency: 'local', gdprCompliant: true },
    securityRules: { dataClassification: 'confidential', encryptionRequired: true, auditLogging: true, retentionDays: 365, allowedNetworks: ['internal'], gdprCompliant: true },
    costPolicy: { costPerExecution: 0.01, currency: 'USD', billingModel: 'per_execution', monthlyQuota: 10000, overagePolicy: 'alert' },
  },
  'Data Privacy': {
    tools: ['data_scanner', 'compliance_checker', 'report_generator', 'notification_sender', 'audit_logger'],
    forbiddenTools: ['shell_unrestricted', 'public_publish', 'external_share', 'external_api_unrestricted'],
    validationRules: { inputSchema: 'strict', outputValidation: true, maxInputSize: '100MB', rateLimitPerMinute: 20, requiresAuthentication: true, requiresMFA: true },
    securityRules: { dataClassification: 'confidential', encryptionRequired: true, auditLogging: true, retentionDays: 730, allowedNetworks: ['internal'] },
    costPolicy: { costPerExecution: 0.0, currency: 'USD', billingModel: 'included', monthlyQuota: 5000, overagePolicy: 'block' },
  },
  'Incident Response': {
    tools: ['incident_cli', 'log_analyzer', 'network_scanner', 'notification_sender', 'report_generator', 'audit_logger'],
    forbiddenTools: ['shell_unrestricted', 'public_publish', 'external_api_unrestricted'],
    validationRules: { inputSchema: 'strict', outputValidation: true, maxInputSize: '50MB', rateLimitPerMinute: 60, requiresAuthentication: true, requiresMFA: true },
    securityRules: { dataClassification: 'confidential', encryptionRequired: true, auditLogging: true, retentionDays: 730, allowedNetworks: ['internal', 'vpn'] },
    costPolicy: { costPerExecution: 0.0, currency: 'USD', billingModel: 'included', monthlyQuota: 10000, overagePolicy: 'block' },
  },
  'Model Training': {
    tools: ['gpu_manager', 'data_loader', 'model_saver', 'evaluation_runner', 'file_output'],
    forbiddenTools: ['shell_unrestricted', 'public_publish', 'production_deploy_unapproved'],
    validationRules: { inputSchema: 'strict', outputValidation: true, maxInputSize: '1GB', rateLimitPerMinute: 5, requiresAuthentication: true, requiresApproval: true },
    securityRules: { dataClassification: 'confidential', encryptionRequired: true, auditLogging: true, retentionDays: 365, allowedNetworks: ['internal'] },
    costPolicy: { costPerExecution: 0.10, currency: 'USD', billingModel: 'per_execution', monthlyQuota: 500, overagePolicy: 'block' },
  },
  'Prompt Engineering': {
    tools: ['local_ai', 'template_engine', 'evaluation_runner', 'file_output', 'memory_read', 'memory_write'],
    forbiddenTools: ['shell_unrestricted', 'public_publish', 'external_model_unapproved'],
    validationRules: { inputSchema: 'strict', outputValidation: true, maxInputSize: '1MB', rateLimitPerMinute: 40, requiresAuthentication: true },
    securityRules: { dataClassification: 'confidential', encryptionRequired: true, auditLogging: true, retentionDays: 180, allowedNetworks: ['internal'] },
    costPolicy: { costPerExecution: 0.0, currency: 'USD', billingModel: 'included', monthlyQuota: 20000, overagePolicy: 'alert' },
  },
  'Course Delivery': {
    tools: ['lms_api', 'content_delivery', 'assessment_engine', 'notification_sender', 'report_generator', 'video_streamer'],
    forbiddenTools: ['shell_unrestricted', 'secret_read', 'database_delete'],
    validationRules: { inputSchema: 'standard', outputValidation: true, maxInputSize: '50MB', rateLimitPerMinute: 60, requiresAuthentication: true },
    securityRules: { dataClassification: 'internal', encryptionRequired: true, auditLogging: true, retentionDays: 180, allowedNetworks: ['internal', 'cdn'] },
    costPolicy: { costPerExecution: 0.0, currency: 'USD', billingModel: 'included', monthlyQuota: 50000, overagePolicy: 'alert' },
  },
  'Student Support': {
    tools: ['lms_api', 'knowledge_base', 'ticket_system', 'email_sender', 'notification_sender', 'document_generator'],
    forbiddenTools: ['shell_unrestricted', 'public_publish', 'database_delete'],
    validationRules: { inputSchema: 'standard', outputValidation: true, maxInputSize: '5MB', rateLimitPerMinute: 60, requiresAuthentication: true, gdprCompliant: true },
    securityRules: { dataClassification: 'confidential', encryptionRequired: true, auditLogging: true, retentionDays: 365, allowedNetworks: ['internal'], gdprCompliant: true },
    costPolicy: { costPerExecution: 0.0, currency: 'USD', billingModel: 'included', monthlyQuota: 30000, overagePolicy: 'alert' },
  },
};

function getConfig(category: string) {
  const override = CAT_OVERRIDES[category];
  if (override) {
    return { ...CATEGORY_CONFIG.default, ...override };
  }
  return CATEGORY_CONFIG.default;
}

function pickTools(allTools: string[], name: string, count: number): string[] {
  // Deterministic selection based on name hash
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  const picked: string[] = [];
  const available = [...allTools];
  for (let i = 0; i < count && available.length > 0; i++) {
    const idx = Math.abs(hash + i * 7) % available.length;
    picked.push(available.splice(idx, 1)[0]);
  }
  return picked;
}

function generateInputs(category: string, name: string) {
  const base = [
    { name: 'task_context', type: 'string', description: `Primary input context for ${name.toLowerCase()} operation`, required: true },
    { name: 'parameters', type: 'object', description: 'Configuration parameters controlling execution behavior', required: false },
  ];
  const extras: { name: string; type: string; description: string; required: boolean }[] = [
    { name: 'source_data', type: 'array', description: 'Input data array for processing', required: false },
    { name: 'filters', type: 'object', description: 'Filter criteria to narrow operation scope', required: false },
    { name: 'output_format', type: 'string', description: 'Desired output format specification', required: false },
    { name: 'priority', type: 'string', description: 'Execution priority level', required: false },
  ];
  // Deterministic pick 1-2 extras
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  const count = 1 + (Math.abs(hash) % 2);
  const picked = [base[0], base[1]];
  for (let i = 0; i < count; i++) {
    picked.push(extras[Math.abs(hash + i * 3) % extras.length]);
  }
  return picked;
}

function generateOutputs(category: string, name: string) {
  return [
    { name: 'result', type: 'object', description: `Primary result output from ${name.toLowerCase()} containing processed data and metadata` },
    { name: 'status', type: 'string', description: 'Execution status indicating success, partial completion, or failure' },
    { name: 'metadata', type: 'object', description: 'Execution metadata including timing, resource usage, and audit information' },
  ];
}

async function main() {
  console.log('=== Skill Protocol Seed v2 ===');
  console.log('Populating empty fields for 2,000 skills...\n');

  const emptySkills = await db.skill.findMany({
    where: {
      OR: [
        { allowedTools: { in: ['[]', '{}', ''] } },
        { validationRules: { in: ['[]', '{}', ''] } },
      ],
    },
    select: { id: true, name: true, category: true },
  });

  console.log(`Found ${emptySkills.length} skills needing updates`);

  let updated = 0;
  const BATCH_SIZE = 100;

  for (let i = 0; i < emptySkills.length; i += BATCH_SIZE) {
    const batch = emptySkills.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async (skill) => {
      const config = getConfig(skill.category);
      const allowedTools = pickTools(config.tools, skill.name, 4);
      const forbiddenTools = pickTools(config.forbiddenTools, skill.name, 2);
      const inputs = generateInputs(skill.category, skill.name);
      const outputs = generateOutputs(skill.category, skill.name);

      await db.skill.update({
        where: { id: skill.id },
        data: {
          allowedTools: JSON.stringify(allowedTools),
          forbiddenTools: JSON.stringify(forbiddenTools),
          inputs: JSON.stringify(inputs),
          outputs: JSON.stringify(outputs),
          validationRules: JSON.stringify(config.validationRules),
          securityRules: JSON.stringify(config.securityRules),
          costPolicy: JSON.stringify(config.costPolicy),
        },
      });
      updated++;
    }));

    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= emptySkills.length) {
      console.log(`  Progress: ${updated} / ${emptySkills.length}`);
    }
  }

  console.log(`\n✅ Updated ${updated} skills`);
  
  // Verify
  const stillEmpty = await db.skill.count({
    where: { allowedTools: { in: ['[]', '{}', ''] } },
  });
  const total = await db.skill.count({});
  console.log(`   Skills with empty allowedTools: ${stillEmpty} / ${total}`);
  console.log(`   Skills populated: ${total - stillEmpty} / ${total}`);
}

main()
  .catch((e) => { console.error('FATAL:', e); process.exit(1); })
  .finally(() => process.exit(0));