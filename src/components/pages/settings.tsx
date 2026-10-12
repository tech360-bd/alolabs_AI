'use client'

import { useApiGet } from '@/hooks/use-api-actions'
import { useDataTable } from '@/hooks/use-data-table'
import { useCreateForm, useDelete } from '@/hooks/use-api-actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Pencil, Trash2, Plus, Save } from 'lucide-react'
import { useState, useEffect } from 'react'
import { fetchApi } from '@/lib/api'
import { useAppStore } from '@/store/app'
import { useToast } from '@/hooks/use-toast'
import TableShell from '@/components/table-shell'

export default function SettingsPage() {
  const { user } = useAppStore()
  const { toast } = useToast()
  const isSuperAdmin = user?.role === 'super_admin'

  // System settings
  const { data: settings, loading: settingsLoading, refresh: refreshSettings } = useApiGet<any[]>('/api/settings')

  // User management (super_admin only)
  const users = useDataTable<any>({ endpoint: '/api/users' })
  const userForm = useCreateForm({ endpoint: '/api/users' })
  const userDel = useDelete()

  // Update setting
  const [editingSetting, setEditingSetting] = useState<string | null>(null)
  const [settingValue, setSettingValue] = useState('')

  const startEditSetting = (s: any) => {
    setEditingSetting(s.id || s.key)
    setSettingValue(s.value ?? s.settingValue ?? '')
  }

  const saveSetting = async (key: string) => {
    try {
      await fetchApi(`/api/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value: settingValue }) })
      toast({ title: 'Setting saved' })
      setEditingSetting(null)
      refreshSettings()
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="system">
        <TabsList>
          <TabsTrigger value="system">System Settings</TabsTrigger>
          {isSuperAdmin && <TabsTrigger value="users">User Management</TabsTrigger>}
        </TabsList>

        <TabsContent value="system" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">System Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              {settingsLoading ? (
                <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-10 animate-pulse bg-slate-200 rounded" />)}</div>
              ) : (
                <div className="space-y-2">
                  {(settings ?? []).map((s: any) => {
                    const key = s.id || s.key
                    const isEditing = editingSetting === key
                    return (
                      <div key={key} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                        <span className="text-sm font-medium w-48 flex-shrink-0">{s.key || s.name || '-'}</span>
                        {isEditing ? (
                          <div className="flex items-center gap-2 flex-1">
                            <Input value={settingValue} onChange={(e) => setSettingValue(e.target.value)} className="h-8 text-sm" />
                            <Button size="sm" onClick={() => saveSetting(key)} className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"><Save className="h-3 w-3" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingSetting(null)} className="h-8">Cancel</Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 flex-1">
                            <span className="text-sm text-muted-foreground truncate">{s.value ?? s.settingValue ?? '-'}</span>
                            <Button variant="ghost" size="sm" onClick={() => startEditSetting(s)} className="h-7"><Pencil className="h-3 w-3" /></Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {(!settings || settings.length === 0) && !settingsLoading && (
                    <p className="text-sm text-muted-foreground text-center py-4">No settings configured. Settings will appear here once the API provides them.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isSuperAdmin && (
          <TabsContent value="users" className="mt-4">
            <TableShell
              loading={users.loading} error={users.error} totalCount={users.total} page={users.page} pageSize={users.pageSize}
              onPageChange={users.setPage} onPageSizeChange={users.setPageSize} searchValue={users.search}
              onSearchChange={users.setSearch} searchPlaceholder="Search users..."
              headerRight={<Button size="sm" onClick={userForm.openCreate} className="bg-amber-600 hover:bg-amber-700 text-white ml-auto"><Plus className="h-4 w-4 mr-1" />New User</Button>}
            >
              <div className="rounded-lg border max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {users.data.map((u: any) => (
                      <TableRow key={u.id || u._id}>
                        <TableCell className="font-medium">{u.name || '-'}</TableCell>
                        <TableCell className="text-sm">{u.email || '-'}</TableCell>
                        <TableCell><Badge variant="outline" className={u.role === 'super_admin' ? 'bg-amber-100 text-amber-700' : ''}>{u.role || 'user'}</Badge></TableCell>
                        <TableCell><Badge variant={u.status === 'active' ? 'default' : 'secondary'} className={u.status === 'active' ? 'bg-emerald-100 text-emerald-700' : ''}>{u.status || 'active'}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => userForm.openEdit(u)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => userDel.deleteItem('/api/users', u.id || u._id, users.refresh)} disabled={userDel.deleting === (u.id || u._id)}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TableShell>
          </TabsContent>
        )}
      </Tabs>

      {/* User Create/Edit Dialog */}
      <Dialog open={userForm.open} onOpenChange={userForm.setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{userForm.editingId ? 'Edit User' : 'Create User'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Name</Label><Input value={userForm.form.name || ''} onChange={(e) => userForm.setForm({ ...userForm.form, name: e.target.value })} placeholder="Full name" /></div>
            <div><Label>Email</Label><Input type="email" value={userForm.form.email || ''} onChange={(e) => userForm.setForm({ ...userForm.form, email: e.target.value })} placeholder="user@example.com" /></div>
            <div><Label>Password</Label><Input type="password" value={userForm.form.password || ''} onChange={(e) => userForm.setForm({ ...userForm.form, password: e.target.value })} placeholder={userForm.editingId ? 'Leave blank to keep current' : 'Password'} /></div>
            <div><Label>Role</Label>
              <select value={userForm.form.role || 'user'} onChange={(e) => userForm.setForm({ ...userForm.form, role: e.target.value })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="user">User</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => userForm.setOpen(false)}>Cancel</Button>
            <Button onClick={() => userForm.submit().then(users.refresh)} disabled={userForm.loading} className="bg-amber-600 hover:bg-amber-700 text-white">
              {userForm.loading ? 'Saving...' : userForm.editingId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}