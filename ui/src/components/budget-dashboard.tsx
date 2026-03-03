'use client'
import { useState, useEffect, useCallback } from 'react'
import { Wallet, AlertTriangle } from 'lucide-react'
import type { BudgetSummary } from '@/lib/types'

export function BudgetDashboard() {
  const [budget, setBudget] = useState<BudgetSummary | null>(null)

  const fetchBudget = useCallback(async () => {
    try {
      const res = await fetch('/api/autopilot?view=budgets')
      if (res.ok) setBudget(await res.json())
    } catch {}
  }, [])

  useEffect(() => {
    fetchBudget()
    const t = setInterval(fetchBudget, 15000)
    return () => clearInterval(t)
  }, [fetchBudget])

  if (!budget) {
    return (
      <div className="text-center text-muted-foreground text-xs py-6">
        <Wallet className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p>Loading budget data...</p>
      </div>
    )
  }

  const companyRatio = budget.company.ratio
  const companyBarColor = companyRatio >= 1 ? 'bg-red-500' : companyRatio >= 0.8 ? 'bg-yellow-500' : 'bg-emerald-500'

  return (
    <div className="space-y-4">
      {/* Company total */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">Company Daily Budget</span>
          <span className="text-muted-foreground">
            {formatTokens(budget.company.used)} / {formatTokens(budget.company.dailyLimit)}
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${companyBarColor}`}
            style={{ width: `${Math.min(companyRatio * 100, 100)}%` }}
          />
        </div>
        {companyRatio >= 0.8 && (
          <div className="flex items-center gap-1 text-[10px] text-yellow-400">
            <AlertTriangle className="w-3 h-3" />
            {companyRatio >= 1 ? 'Budget exceeded!' : 'Approaching budget limit'}
          </div>
        )}
      </div>

      {/* Department breakdown */}
      {Object.keys(budget.departments).length > 0 && (
        <div className="space-y-2">
          <span className="text-[10px] text-muted-foreground font-medium">Department Breakdown</span>
          {Object.entries(budget.departments).map(([deptId, dept]) => {
            const ratio = dept.ratio
            const barColor = ratio >= 1 ? 'bg-red-500' : ratio >= 0.8 ? 'bg-yellow-500' : 'bg-emerald-500'
            return (
              <div key={deptId} className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span>{deptId}</span>
                  <span className="text-muted-foreground">
                    {formatTokens(dept.used)} / {dept.limit > 0 ? formatTokens(dept.limit) : 'unlimited'}
                  </span>
                </div>
                {dept.limit > 0 && (
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${barColor}`}
                      style={{ width: `${Math.min(ratio * 100, 100)}%` }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {Object.keys(budget.departments).length === 0 && (
        <div className="text-center text-[10px] text-muted-foreground py-3">
          No department budgets configured.
        </div>
      )}
    </div>
  )
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`
  return String(n)
}
