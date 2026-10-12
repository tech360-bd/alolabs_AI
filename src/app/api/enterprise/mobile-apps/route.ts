import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { db } from '@/lib/db'

const DEFAULT_APPS = [
  {
    id: 'app-customer', name: 'ALO Customer App', platform: 'Flutter (iOS + Android)',
    status: 'planned', priority: 1, progress: 0,
    purpose: 'Customer self-service + AI assistance',
    features: ['Login/Signup', 'Dashboard', 'AI Chat (Bengali/English)', 'Hosting Management', 'Ecommerce Store', 'WhatsApp Chat', 'Voice Commands', 'Payment (bKash/Nagad/Cards)', 'Order Tracking', 'Push Notifications', 'Offline Mode', 'Biometric Auth', 'Multi-language', 'Referral Program', 'AI Recommendations', 'Video Tutorials'],
    techStack: ['Flutter', 'Firebase Auth', 'Socket.io', 'FCM', 'Stripe', 'bKash API', 'Nagad API'],
    screens: 30, apiEndpoints: 100, sprintWeeks: 8,
    targetLaunch: 'Month 1 MVP, Month 3 Full',
    revenueImpact: 'HIGH',
  },
  {
    id: 'app-admin', name: 'ALO Admin App', platform: 'Flutter (iOS + Android)',
    status: 'planned', priority: 2, progress: 0,
    purpose: 'Monitor and control entire AI-EOS from mobile',
    features: ['Executive Dashboard', 'Department Status', 'Agent Monitoring', 'Revenue Dashboard', 'Customer Insights', 'DCC Status', 'Approve/Reject', 'Voice Commands', 'Emergency Controls', 'Multi-dept Chat', 'Push Notifications', 'Reports', 'AI Advisor', 'Financial Reports'],
    techStack: ['Flutter', 'Firebase Auth', 'Socket.io', 'FCM', 'Chart.js'],
    screens: 25, apiEndpoints: 80, sprintWeeks: 8,
    targetLaunch: 'Month 1 MVP, Month 3 Full',
    revenueImpact: 'HIGH',
  },
  {
    id: 'app-agent-mgmt', name: 'ALO Agent Management App', platform: 'Flutter (iOS + Android)',
    status: 'planned', priority: 3, progress: 0,
    purpose: 'Manage 2,000 AI agents from mobile',
    features: ['Agent Directory', 'Health Monitoring', 'Performance Analytics', 'Skill Management', 'Prompt Library', 'Agent Training', 'DCC Tracking', 'Team Formation', 'Task Assignment', 'Communication Logs', 'Escalation Mgmt', 'Agent Retirement', 'Cost Analytics', 'Learning Progress'],
    techStack: ['Flutter', 'Firebase Auth', 'Socket.io', 'FCM'],
    screens: 20, apiEndpoints: 60, sprintWeeks: 6,
    targetLaunch: 'Month 2 MVP, Month 4 Full',
    revenueImpact: 'MEDIUM',
  },
  {
    id: 'app-reseller', name: 'ALO Reseller App', platform: 'Flutter (iOS + Android)',
    status: 'planned', priority: 4, progress: 0,
    purpose: 'Grow business through resellers with AI support',
    features: ['Reseller Dashboard', 'Customer Management', 'Commission Tracking', 'AI Sales Tools', 'Custom Pricing', 'Marketing Materials', 'Training Modules', 'Support Tickets', 'Payment/Withdrawal', 'Growth Analytics'],
    techStack: ['Flutter', 'Firebase Auth', 'FCM', 'Stripe Connect'],
    screens: 18, apiEndpoints: 50, sprintWeeks: 6,
    targetLaunch: 'Month 3 MVP, Month 5 Full',
    revenueImpact: 'HIGH',
  },
]

export async function GET() {
  try {
    await requireAuth()

    // Try to get stored app specs from DB (allows updates to progress/status)
    const setting = await db.settings.findUnique({ where: { key: 'mobile-apps-spec' } })
    let apps: typeof DEFAULT_APPS

    if (setting) {
      try {
        apps = JSON.parse(setting.value)
      } catch {
        apps = DEFAULT_APPS
      }
    } else {
      apps = DEFAULT_APPS
      // Initialize in DB for future updates
      await db.settings.upsert({
        where: { key: 'mobile-apps-spec' },
        update: {},
        create: { key: 'mobile-apps-spec', value: JSON.stringify(apps), type: 'json' },
      })
    }

    return NextResponse.json({ apps, total: apps.length })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Enterprise mobile-apps error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
