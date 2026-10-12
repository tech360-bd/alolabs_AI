'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Construction } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { EnterpriseView } from '../enterprise-shell'

interface PlaceholderProps {
  onNavigate?: (view: EnterpriseView) => void
}

export default function PlaceholderPanel({ onNavigate }: PlaceholderProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full mx-4">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#003ABC]/8">
            <Construction className="h-8 w-8 text-[#003ABC]" />
          </div>
          <CardTitle className="text-xl">Module Under Development</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-sm text-slate-500">
            This enterprise module is currently being built. Check back soon for full functionality.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Badge variant="secondary">Coming Soon</Badge>
            <Badge variant="outline">Enterprise Grade</Badge>
          </div>
          {onNavigate && (
            <Button
              variant="outline"
              className="mt-2"
              onClick={() => onNavigate('enterprise-overview')}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Overview
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
