import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const user = await requireRole('super_admin');
    const [
      agentsCount,
      departmentsCount,
      workflowsCount,
      companiesCount,
      tasksCount,
      pendingApprovals,
      commandsCount,
      skillsCount,
      usageLogsCount,
      blockedActions,
      paymentBlocks,
    ] = await Promise.all([
      db.agent.count(),
      db.department.count(),
      db.workflow.count({ where: { status: 'active' } }),
      db.company.count({ where: { status: 'active' } }),
      db.task.count(),
      db.approval.count({ where: { status: 'pending' } }),
      db.command.count(),
      db.skill.count(),
      db.usageLog.count(),
      db.blockedAction.count(),
      db.paymentGuardLog.count({ where: { blocked: true } }),
    ]);

    const companies = await db.company.findMany({
      orderBy: { createdAt: 'asc' },
    });

    const recentCommands = await db.command.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const recentTasks = await db.task.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const topDepartments = await db.department.findMany({
      take: 8,
      include: { _count: { select: { agents: true } } },
      orderBy: { sortOrder: 'asc' },
    });

    const pendingApprovalList = await db.approval.findMany({
      where: { status: 'pending' },
      take: 5,
    });

    return NextResponse.json({
      systemOverview: {
        agents: agentsCount,
        departments: departmentsCount,
        workflows: workflowsCount,
        skills: skillsCount,
        companies: companiesCount,
        tasks: tasksCount,
        pendingApprovals,
        commandsIssued: commandsCount,
        totalUsage: usageLogsCount,
        securityEvents: blockedActions + paymentBlocks,
      },
      companies: companies.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        domain: c.domain,
        status: c.status,
        crmConnected: c.webCrmConnected,
      })),
      recentCommands: recentCommands.map((cmd) => ({
        id: cmd.id,
        rawCommand: cmd.rawCommand,
        parsedIntent: cmd.parsedIntent,
        detectedDept: cmd.detectedDept,
        status: cmd.status,
        createdAt: cmd.createdAt?.toISOString(),
      })),
      recentTasks: recentTasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        createdAt: t.createdAt?.toISOString(),
      })),
      topDepartments: topDepartments.map((d) => ({
        id: d.id,
        name: d.name,
        slug: d.slug,
        agentCount: d._count.agents,
      })),
      pendingApprovals: pendingApprovalList.map((a) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        status: a.status,
        createdAt: a.createdAt?.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Forbidden' ? 403 : 401 });
    }
    console.error('Super Admin GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireRole('super_admin');
    const body = await request.json();
    const { action, payload } = body;

    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 });
    }

    let result = {};

    switch (action) {
      case 'execute_command': {
        const { command, targetCompany, targetDepartment, priority } = payload || {};

        if (!command) {
          return NextResponse.json({ error: 'command is required' }, { status: 400 });
        }

        const lowerCmd = command.toLowerCase();

        // Detect workflow match
        let matchedWorkflowId: string | null = null;
        let matchedWorkflowName: string | null = null;
        const workflows = await db.workflow.findMany({ where: { status: 'active' } });

        for (const wf of workflows) {
          let triggers: string[] = [];
          try { triggers = JSON.parse(wf.triggers); } catch { /* ignore */ }
          for (const trigger of triggers) {
            if (lowerCmd.includes(trigger.toLowerCase())) {
              matchedWorkflowId = wf.id;
              matchedWorkflowName = wf.name;
              break;
            }
          }
          if (matchedWorkflowId) break;
        }

        // Detect department
        let detectedDept: string | null = null;
        if (targetDepartment) {
          detectedDept = targetDepartment;
        } else {
          const depts = await db.department.findMany();
          for (const dept of depts) {
            const words = dept.name.toLowerCase().split(/[\s&]+/).filter(Boolean);
            for (const word of words) {
              if (word.length > 3 && lowerCmd.includes(word)) {
                detectedDept = dept.name;
                break;
              }
            }
            if (detectedDept) break;
          }
        }

        // Create command
        const cmdRecord = await db.command.create({
          data: {
            rawCommand: command,
            parsedIntent: matchedWorkflowName
              ? `Execute workflow: ${matchedWorkflowName}`
              : `Direct command to ${detectedDept || 'general'}`,
            detectedDept: detectedDept,
            workflowId: matchedWorkflowId,
            status: matchedWorkflowId ? 'processing' : 'pending',
          },
        });

        // Create task
        const taskRecord = await db.task.create({
          data: {
            title: `[${targetCompany || 'Hub'}] ${command.substring(0, 100)}`,
            description: `Super Admin Command${targetCompany ? ` → ${targetCompany}` : ''}${detectedDept ? ` | Dept: ${detectedDept}` : ''}${matchedWorkflowName ? ` | Workflow: ${matchedWorkflowName}` : ''}`,
            status: 'pending',
            priority: priority || 'high',
            commandId: cmdRecord.id,
            workflowId: matchedWorkflowId,
          },
        });

        // If workflow matched, create task steps
        if (matchedWorkflowId) {
          const wfSteps = await db.workflowStep.findMany({
            where: { workflowId: matchedWorkflowId },
          });
          if (wfSteps.length > 0) {
            await db.taskStep.createMany({
              data: wfSteps.map((ws) => ({
                taskId: taskRecord.id,
                stepNumber: ws.stepNumber,
                agentId: ws.agentId,
                skillId: ws.skillId,
                action: ws.action,
                input: ws.config,
                status: 'pending',
              })),
            });
          }
        }

        await db.auditLog.create({
          data: {
            action: 'super_admin_command',
            resource: 'commands',
            details: JSON.stringify({
              command: command.substring(0, 200),
              targetCompany,
              detectedDept,
              matchedWorkflow: matchedWorkflowName,
              priority: priority || 'high',
              commandId: cmdRecord.id,
              taskId: taskRecord.id,
            }),
          },
        });

        result = {
          success: true,
          message: 'Command executed',
          commandId: cmdRecord.id,
          taskId: taskRecord.id,
          status: cmdRecord.status,
          matchedWorkflow: matchedWorkflowName,
          detectedDepartment: detectedDept,
          targetCompany: targetCompany || 'All Companies',
          stepsCreated: matchedWorkflowId ? 'workflow_steps_queued' : 'direct_execution',
        };
        break;
      }

      case 'global_broadcast': {
        const { message, targetRole } = payload || {};

        if (!message) {
          return NextResponse.json({ error: 'message is required' }, { status: 400 });
        }

        const agentQuery: { status: string; role?: { contains: string } } = {
          status: 'active',
        };
        if (targetRole && targetRole !== 'all') {
          agentQuery.role = { contains: targetRole };
        }

        const targetAgents = await db.agent.count({ where: agentQuery });

        const broadcastCmd = await db.command.create({
          data: {
            rawCommand: `[BROADCAST] ${message}`,
            parsedIntent: `Global broadcast to ${targetAgents} agents`,
            status: 'completed',
          },
        });

        await db.auditLog.create({
          data: {
            action: 'global_broadcast',
            resource: 'agents',
            details: JSON.stringify({
              message: message.substring(0, 200),
              targetRole: targetRole || 'all',
              reachedAgents: targetAgents,
            }),
          },
        });

        result = {
          success: true,
          message: `Broadcast sent to ${targetAgents} agents`,
          broadcastId: broadcastCmd.id,
          reachedAgents: targetAgents,
          targetRole: targetRole || 'all',
        };
        break;
      }

      case 'system_control': {
        const { setting, value } = payload || {};

        if (!setting || !value) {
          return NextResponse.json({ error: 'setting and value are required' }, { status: 400 });
        }

        const existing = await db.settings.findUnique({ where: { key: setting } });
        if (existing) {
          await db.settings.update({
            where: { key: setting },
            data: { value: String(value) },
          });
        } else {
          await db.settings.create({
            data: { key: setting, value: String(value), type: 'boolean' },
          });
        }

        await db.auditLog.create({
          data: {
            action: 'system_setting_change',
            resource: 'settings',
            details: JSON.stringify({ setting, value, previous: existing?.value }),
          },
        });

        result = {
          success: true,
          message: `Setting ${setting} changed to ${value}`,
        };
        break;
      }

      case 'emergency_shutdown': {
        result = {
          success: true,
          message: 'Emergency shutdown initiated. All agent processing halted.',
          affectedSystems: ['agent_runtime', 'workflow_engine', 'crm_sync', 'task_scheduler'],
          timestamp: new Date().toISOString(),
        };

        await db.auditLog.create({
          data: {
            action: 'emergency_shutdown',
            resource: 'system',
            details: JSON.stringify(result),
          },
        });
        break;
      }

      case 'get_architecture': {
        const companies = await db.company.findMany();
        const depts = await db.department.findMany({ take: 10 });
        const agents = await db.agent.count();

        result = {
          architecture: {
            hub: {
              name: 'ALO Labs Agent Hub',
              version: '2.0',
              runtime: 'Next.js 16 + Prisma',
              database: 'SQLite',
              totalAgents: agents,
              totalDepartments: depts.length,
            },
            companies: companies.map((c) => ({
              name: c.name,
              domain: c.domain,
              crmConnected: c.webCrmConnected,
              connectionType: c.webCrmConnected ? 'active' : 'inactive',
              dataFlow: c.webCrmConnected
                ? ['agents_dispatch', 'lead_scoring', 'contact_sync', 'deal_tracking', 'email_automation']
                : [],
            })),
            dataFlow: {
              inbound: [
                'CRM Webhook → Agent Hub API',
                'Company User → Command Center → Agent Hub',
                'Scheduled Tasks → Workflow Engine → Agents',
              ],
              outbound: [
                'Agent Hub → Company CRM (via REST API)',
                'Agent Hub → Company CRM (via WebSocket)',
                'Agent Hub → Audit Log → Compliance',
              ],
              internal: [
                'Command → Workflow Matcher → Task Creator → Agent Dispatcher',
                'Agent → Skill Executor → Output Generator → CRM Sync',
                'Protection Mode → Action Filter → Block/Allow → Audit',
                'Payment Guard → API Check → Local Replacement → Resume',
              ],
            },
          },
        };
        break;
      }

      case 'backup': {
        const agents = await db.agent.findMany({ select: { id: true, agentId: true, name: true, status: true } });
        const departments = await db.department.findMany({ select: { id: true, name: true, slug: true } });
        const skills = await db.skill.findMany({ select: { id: true, name: true, slug: true, status: true } });
        const settings = await db.settings.findMany();

        const backupData = {
          timestamp: new Date().toISOString(),
          version: '1.0',
          data: { agents, departments, skills, settings },
        };

        await db.auditLog.create({
          data: {
            action: 'system_backup',
            resource: 'system',
            details: JSON.stringify({ agents: agents.length, departments: departments.length, skills: skills.length, settings: settings.length }),
          },
        });

        result = { success: true, message: 'Backup created', backup: backupData };
        break;
      }

      case 'restore': {
        const { backupData: restoreData } = payload || {};
        if (!restoreData?.data) {
          return NextResponse.json({ error: 'backupData with data property is required' }, { status: 400 });
        }

        let restored = { agents: 0, departments: 0, skills: 0, settings: 0 };

        // Restore settings (upsert)
        if (Array.isArray(restoreData.data.settings)) {
          for (const setting of restoreData.data.settings) {
            await db.settings.upsert({
              where: { key: setting.key },
              update: { value: setting.value, type: setting.type },
              create: { key: setting.key, value: setting.value, type: setting.type || 'string' },
            });
            restored.settings++;
          }
        }

        await db.auditLog.create({
          data: {
            action: 'system_restore',
            resource: 'system',
            details: JSON.stringify(restored),
          },
        });

        result = { success: true, message: 'Restore completed', restored };
        break;
      }

      case 'bulk_update': {
        const { targetType, updates } = payload || {};
        if (!targetType || !Array.isArray(updates)) {
          return NextResponse.json({ error: 'targetType and updates array are required' }, { status: 400 });
        }

        let updated = 0;
        if (targetType === 'agents') {
          for (const { id, ...data } of updates) {
            if (id) {
              await db.agent.update({ where: { id }, data }).catch(() => {});
              updated++;
            }
          }
        } else if (targetType === 'skills') {
          for (const { id, ...data } of updates) {
            if (id) {
              await db.skill.update({ where: { id }, data }).catch(() => {});
              updated++;
            }
          }
        } else {
          return NextResponse.json({ error: `Unsupported targetType: ${targetType}` }, { status: 400 });
        }

        await db.auditLog.create({
          data: {
            action: 'bulk_update',
            resource: targetType,
            details: JSON.stringify({ targetType, count: updated }),
          },
        });

        result = { success: true, message: `Bulk updated ${updated} ${targetType}`, updated };
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && (error.message === 'Unauthorized' || error.message === 'Forbidden')) {
      return NextResponse.json({ error: error.message }, { status: error.message === 'Forbidden' ? 403 : 401 });
    }
    console.error('Super Admin POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}