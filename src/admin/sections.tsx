/**
 * The Admin portal's sections (People, Students, Classes, Admins & roles, Activity log), each opened from the
 * dashboard (app/admin/index.tsx) on its own screen (app/admin/[section].tsx), and the admin tools that live in
 * other apps. What each admin sees follows their role and permissions; the database enforces the same rules.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import type { Href } from 'expo-router';
import type { Ionicons } from '@expo/vector-icons';
import {
  adminClearAvatar, adminDeleteRole, adminDeleteUser, adminFamilyLinks, adminLinkGuardian, adminListPeople, adminRoles, adminSaveRole, adminSetAccess,
  adminSetCarlineDuty, adminSetDirector, adminSetVolunteerLead, adminUpdateProfile, getUser, listAudit, me, permissionCatalog,
  ROLE_LABELS,
  type Access, type AdminPerson, type AdminRole, type FamilyLink, type PeopleFilter, type PermissionInfo,
} from '../api/connect';
import { GradePicker } from '../comms/GradePicker';
import { gradeLabel } from '../comms/grades';
import type { SchoolRole } from '../comms/types';
import { Avatar, Button, C, Card, Chip, Field, H, Loading, P, s } from '../ui';
import { SCHOOL } from '../school';

const PAGE = 20;
const ROLES: SchoolRole[] = ['admin', 'teacher', 'staff', 'substitute', 'parent', 'family', 'student'];
const FILTERS: [PeopleFilter, string][] = [
  ['all', 'All'], ['pending', 'Needs approval'], ['staff', 'Staff'], ['parents', 'Parents'], ['family', 'Family'], ['students', 'Students'], ['admins', 'Admins'],
];
const STAFF = ['admin', 'teacher', 'staff'];

const pill = (label: string, on: boolean, onPress: () => void, color = C.primary) => (
  <Text key={label} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
    style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: 'hidden', borderWidth: 1,
      borderColor: C.line, backgroundColor: on ? color : '#fff', color: on ? '#fff' : C.ink }}>{label}</Text>
);
const link = (label: string, onPress: () => void, color = C.primary) => (
  <Text onPress={onPress} accessibilityRole="button" style={{ color, fontWeight: '700' }}>{label}</Text>
);
const label = (t: string) => <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted, marginTop: 6 }}>{t}</Text>;
const confirm = (title: string, msg: string, onYes: () => void) => {
  if (Platform.OS === 'web') { if (globalThis.confirm?.(`${title}\n\n${msg}`)) onYes(); return; }
  Alert.alert(title, msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Yes', style: 'destructive', onPress: onYes }]);
};
const fail = (e: any) => Alert.alert('Not allowed', e.message);
export const fullName = (p: { firstName: string; lastName: string }) => (p.firstName || p.lastName ? `${p.firstName} ${p.lastName}`.trim() : '(no name yet)');

/** Debounced server search: one page of people matching the term and filter. */
function usePeople(search: string, filter: PeopleFilter, limit: number, offset: number, reload = 0, enabled = true) {
  const [res, setRes] = useState<{ people: AdminPerson[]; total: number } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const t = setTimeout(() => adminListPeople({ search, filter, limit, offset })
      .then((r) => live && setRes(r)).catch((e) => { if (live) { setRes({ people: [], total: 0 }); fail(e); } }), search ? 300 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [search, filter, limit, offset, reload, enabled]);
  return res;
}

// ------------------------------------------------------------------ people

function PersonCard({ p, links, access, roles, onChange }: {
  p: AdminPerson; links: FamilyLink[]; access: Access; roles: AdminRole[]; onChange: () => void;
}) {
  const [open, setOpen] = useState(!!p.pending);
  const [grade, setGrade] = useState<number | null>(p.grade ?? null);
  const [linkKid, setLinkKid] = useState<{ id: string; name: string } | null>(null);
  const [q, setQ] = useState('');
  const found = usePeople(q.trim(), 'students', 6, 0, 0, q.trim() !== '');
  const can = (x: string) => access.permissions.includes(x);
  const isAdminAccount = !!p.adminTier || p.schoolRole === 'admin';
  const roleOptions = ROLES.filter((r) => {
    if (r === 'admin' || isAdminAccount) return can('admins.manage');
    if (p.pending && (r === 'parent' || r === 'student' || r === 'family')) return can('people.approve') || can('people.roles');
    return can('people.roles');
  });
  const setRole = (r: SchoolRole | null) =>
    adminUpdateProfile(p.id, r, r === 'student' && grade !== null ? grade : p.grade ?? null).then(onChange).catch(fail);
  const children = links.filter((l) => l.guardianId === p.id);
  const parents = links.filter((l) => l.studentId === p.id);
  const roleName = roles.find((r) => r.id === p.adminTier)?.name ?? p.adminTier;

  return (
    <Card onPress={() => setOpen(!open)}>
      <View style={s.row}>
        <Avatar person={getUser(p.id) ?? p} size={36} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>{fullName(p)}</Text>
          <P muted>{p.email ?? 'No login'}{p.grade != null ? ` · ${gradeLabel(p.grade)}` : ''}</P>
        </View>
        {roleName && <Chip label={roleName} color={C.accent} />}
        {p.carlineDuty && <Chip label="Car line lead" color="#15803D" />}
        {p.volunteerLead && <Chip label="Volunteer lead" color="#DB2777" />}
        {p.pending ? <Chip label="Needs approval" color="#B45309" /> : <Chip label={ROLE_LABELS[p.schoolRole] ?? p.schoolRole} />}
      </View>
      {(children.length > 0 || parents.length > 0) && (
        <P muted>{children.length
          ? `${p.schoolRole === 'family' ? 'Picks up' : 'Parent of'} ${children.map((c) => c.studentName).join(', ')}`
          : [['Parents', parents.filter((c) => !c.pickupOnly)], ['Family', parents.filter((c) => c.pickupOnly)]]
              .filter(([, l]) => (l as FamilyLink[]).length).map(([t, l]) => `${t}: ${(l as FamilyLink[]).map((c) => c.guardianName).join(', ')}`).join(' · ')}</P>
      )}
      {open && (
        <View style={{ gap: 8 }}>
          {roleOptions.length > 0 && p.adminTier !== 'director' && (
            <View style={[s.row, { flexWrap: 'wrap' }]}>
              {roleOptions.map((r) => pill(r, p.schoolRole === r && !p.pending, () => setRole(r)))}
              {!p.pending && p.id !== me()?.id && pill('revoke access', false, () => confirm('Revoke access?', `${p.firstName} will lose access to ${SCHOOL.connectName}.`, () => setRole(null)), C.danger)}
            </View>
          )}
          {p.adminTier === 'director' && <P muted>Directors are managed under Admins & roles.</P>}
          {can('people.roles') && !!getUser(p.id)?.avatar && p.id !== me()?.id && (
            <Text style={{ color: C.danger }} onPress={() => confirm('Remove photo?', `${fullName(p)}'s profile photo will be removed.`,
              () => adminClearAvatar(p.id).then(onChange).catch(fail))}>Remove profile photo</Text>
          )}
          {!p.pending && ['admin', 'teacher', 'staff'].includes(p.schoolRole) && can('people.family') && (
            <View style={[s.row, { flexWrap: 'wrap' }]}>
              {pill(p.carlineDuty ? '🚗 Car line lead' : '🚗 Make car line lead', !!p.carlineDuty,
                () => adminSetCarlineDuty(p.id, !p.carlineDuty).then(onChange).catch(fail), '#15803D')}
            </View>
          )}
          {!p.pending && p.schoolRole !== 'student' && p.schoolRole !== 'family' && p.schoolRole !== 'substitute' && can('people.family') && (
            <View style={[s.row, { flexWrap: 'wrap' }]}>
              {pill(p.volunteerLead ? '🙋 Volunteer Leader' : '🙋 Make Volunteer Leader', !!p.volunteerLead,
                () => adminSetVolunteerLead(p.id, !p.volunteerLead).then(onChange).catch(fail), '#DB2777')}
            </View>
          )}
          {p.schoolRole === 'student' && can('people.family') && (
            <View style={[s.row, { alignItems: 'flex-end' }]}>
              <View style={{ flex: 1 }}><GradePicker value={grade} onChange={setGrade} /></View>
              <Button label="Save grade" kind="ghost" disabled={grade === p.grade} onPress={() => setRole('student')} />
            </View>
          )}
          {!p.pending && p.schoolRole !== 'student' && can('people.family') && (
            <View style={{ gap: 6 }}>
              {children.map((c) => (
                <Text key={c.studentId} style={{ color: C.ink }}>👪 {c.studentName}{'  '}
                  <Text style={{ color: C.danger }} onPress={() => adminLinkGuardian(p.id, c.studentId, false).then(onChange).catch(fail)}>unlink</Text>
                </Text>
              ))}
              {linkKid && (
                <View style={{ gap: 6 }}>
                  <Text style={{ color: C.ink }}>Link {p.firstName} to {linkKid.name} as their:</Text>
                  <View style={[s.row, { gap: 8 }]}>
                    {(['mother', 'father'] as const).map((r) => (
                      <View key={r} style={{ flex: 1 }}>
                        <Button label={r === 'mother' ? 'Mother' : 'Father'}
                          onPress={() => adminLinkGuardian(p.id, linkKid.id, true, r).then(() => { setLinkKid(null); onChange(); }).catch(fail)} />
                      </View>
                    ))}
                  </View>
                  <Text style={{ color: C.muted }} onPress={() => setLinkKid(null)}>Cancel</Text>
                </View>
              )}
              <Field label="Link a student" placeholder="Search by name" value={q} onChangeText={setQ} />
              {q.trim() !== '' && found?.people.filter((x) => !children.some((c) => c.studentId === x.id)).map((x) => (
                <Text key={x.id} style={{ color: C.primary }} onPress={() => {
                  setQ('');
                  if (p.schoolRole === 'family') adminLinkGuardian(p.id, x.id).then(onChange).catch(fail);
                  else setLinkKid({ id: x.id, name: fullName(x) });
                }}>
                  + {fullName(x)} ({x.grade != null ? gradeLabel(x.grade) : 'no grade'})
                </Text>
              ))}
              <P muted>{p.schoolRole === 'family'
                ? 'Family accounts can pick up the students linked here at the car line. They don\'t join groups.'
                : 'Linked parents join their student\'s family groups automatically.'}</P>
            </View>
          )}
          {can('people.delete') && p.id !== me()?.id && p.adminTier !== 'director' && (p.email || p.schoolRole !== 'student')
            && (!isAdminAccount || can('admins.manage')) && (
            <Text style={{ color: C.danger, marginTop: 4 }} onPress={() => confirm('Delete account?',
              `${fullName(p)}'s account will be permanently deleted, with everything they posted. This can't be undone.`,
              () => adminDeleteUser(p.id).then(onChange).catch(fail))}>Delete account…</Text>
          )}
        </View>
      )}
    </Card>
  );
}

function Pager({ offset, total, onPage }: { offset: number; total: number; onPage: (o: number) => void }) {
  if (total <= PAGE) return null;
  return (
    <View style={[s.row, { justifyContent: 'space-between' }]}>
      <Button label="‹ Previous" kind="ghost" disabled={offset === 0} onPress={() => onPage(Math.max(0, offset - PAGE))} />
      <Text style={{ color: C.muted }}>{offset + 1}–{Math.min(offset + PAGE, total)} of {total}</Text>
      <Button label="Next ›" kind="ghost" disabled={offset + PAGE >= total} onPress={() => onPage(offset + PAGE)} />
    </View>
  );
}

function People({ access, roles, initialFilter = 'all' }: { access: Access; roles: AdminRole[]; initialFilter?: PeopleFilter }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<PeopleFilter>(initialFilter);
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const [links, setLinks] = useState<FamilyLink[]>([]);
  const page = usePeople(q.trim(), filter, PAGE, offset, reload);
  const loadLinks = useCallback(() => adminFamilyLinks().then(setLinks).catch(() => setLinks([])), []);
  useEffect(() => { loadLinks(); }, [loadLinks]);
  useEffect(() => setOffset(0), [q, filter]);
  const changed = () => { setReload((n) => n + 1); loadLinks(); };

  return (
    <>
      <Field label="Search people" placeholder="Name or email" autoCapitalize="none" value={q} onChangeText={setQ} />
      <View style={[s.row, { flexWrap: 'wrap' }]}>{FILTERS.map(([k, l]) => pill(l, filter === k, () => setFilter(k)))}</View>
      {!page ? <Loading /> : (
        <>
          <P muted>{page.total === 0 ? 'Nobody matches.' : `${page.total} ${page.total === 1 ? 'person' : 'people'}`}</P>
          {page.people.map((p) => <PersonCard key={p.id} p={p} links={links} access={access} roles={roles} onChange={changed} />)}
          <Pager offset={offset} total={page.total} onPage={setOffset} />
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ admins & roles (directors)

function PermissionChecks({ catalog, value, fixed = [], onChange, disabled }: {
  catalog: PermissionInfo[]; value: string[]; fixed?: string[]; onChange: (v: string[]) => void; disabled?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      {catalog.filter((c) => c.key !== 'admins.manage').map((c) => {
        const fromRole = fixed.includes(c.key);
        const on = fromRole || value.includes(c.key);
        return (
          <Text key={c.key} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: fromRole || disabled }}
            onPress={fromRole || disabled ? undefined : () => onChange(on ? value.filter((g) => g !== c.key) : [...value, c.key])}
            style={{ color: fromRole ? C.muted : C.ink }}>
            {on ? '☑' : '☐'} <Text style={{ fontWeight: '700' }}>{c.label}</Text>{fromRole ? ' (from role)' : ''}{'\n'}
            <Text style={{ color: C.muted, fontSize: 13 }}>{c.description}</Text>
          </Text>
        );
      })}
    </View>
  );
}

function RoleCard({ role, catalog, onChange, startOpen = false, onCancel }: {
  role: AdminRole | null; catalog: PermissionInfo[]; onChange: () => void; startOpen?: boolean; onCancel?: () => void;
}) {
  const [open, setOpen] = useState(startOpen);
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [perms, setPerms] = useState<string[]>(role?.permissions ?? []);
  const save = () => adminSaveRole({ id: role?.id ?? null, name, description, permissions: perms })
    .then(() => { if (!role) onCancel?.(); else setOpen(false); onChange(); }).catch(fail);

  if (role?.isSystem) {
    return (
      <Card>
        <View style={s.row}><Text style={{ flex: 1, fontWeight: '800', color: C.ink }}>{role.name}</Text><Chip label="Built in" color={C.accent} /></View>
        <P muted>{role.description}</P>
      </Card>
    );
  }
  return (
    <Card onPress={open ? undefined : () => setOpen(true)}>
      {role && (
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', color: C.ink }}>{role.name}</Text>
            <P muted>{role.description || 'No description'} · {role.permissions.length} permission{role.permissions.length === 1 ? '' : 's'}</P>
          </View>
          {open && link('Close', () => setOpen(false), C.muted)}
        </View>
      )}
      {open && (
        <View style={{ gap: 10 }}>
          <Field label="Role name" placeholder="e.g. Athletics Director" value={name} onChangeText={setName} maxLength={60} />
          <Field label="Description" placeholder="What this role is for" value={description} onChangeText={setDescription} maxLength={200} />
          {label('PERMISSIONS')}
          <PermissionChecks catalog={catalog} value={perms} onChange={setPerms} />
          <Button label={role ? 'Save role' : 'Create role'} disabled={!name.trim()} onPress={save} />
          {role ? link('Delete role…', () => confirm(`Delete "${role.name}"?`, 'Everyone with this role loses the admin access it gave them.',
            () => adminDeleteRole(role.id).then(onChange).catch(fail)), C.danger)
            : link('Cancel', () => onCancel?.(), C.muted)}
        </View>
      )}
    </Card>
  );
}

function AccessCard({ p, roles, catalog, onChange }: { p: AdminPerson; roles: AdminRole[]; catalog: PermissionInfo[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<string | null>(p.adminTier);
  const [granted, setGranted] = useState<string[]>(p.granted);
  const staff = STAFF.includes(p.schoolRole);
  const assignable = roles.filter((r) => !r.isSystem);
  const fixed = roles.find((r) => r.id === role)?.permissions ?? [];
  const roleName = roles.find((r) => r.id === p.adminTier)?.name ?? p.adminTier;
  const save = () => adminSetAccess(p.id, role, granted.filter((g) => !fixed.includes(g))).then(() => { setOpen(false); onChange(); }).catch(fail);

  return (
    <Card onPress={open ? undefined : () => setOpen(true)}>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>{fullName(p)}</Text>
          <P muted>{p.email} · {p.schoolRole}{p.granted.length ? ` · +${p.granted.length} permission${p.granted.length > 1 ? 's' : ''}` : ''}</P>
        </View>
        {roleName && <Chip label={roleName} color={C.accent} />}
      </View>
      {open && (
        <View style={{ gap: 10 }}>
          {label('ROLE')}
          {staff ? (
            <View style={[s.row, { flexWrap: 'wrap' }]}>
              {pill('No admin role', role === null, () => setRole(null))}
              {assignable.map((r) => pill(r.name, role === r.id, () => setRole(r.id)))}
            </View>
          ) : <P muted>Admin roles are for staff accounts; you can still grant individual permissions.</P>}
          {label('EXTRA PERMISSIONS')}
          <PermissionChecks catalog={catalog} value={granted} fixed={fixed} onChange={setGranted} disabled={p.schoolRole === 'student' || p.schoolRole === 'family' || p.schoolRole === 'substitute'} />
          <Button label="Save access" onPress={save} />
          <View style={[s.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}>
            {staff ? link(`Make ${p.firstName || 'them'} a director…`, () => confirm('Add a director?',
              `${fullName(p)} gets every permission, including managing admins, roles and other directors.`,
              () => adminSetDirector(p.id, true).then(onChange).catch(fail)), C.danger) : <View />}
            {link('Close', () => setOpen(false), C.muted)}
          </View>
        </View>
      )}
    </Card>
  );
}

function Admins({ catalog, roles, reloadRoles }: { catalog: PermissionInfo[]; roles: AdminRole[]; reloadRoles: () => void }) {
  const [reload, setReload] = useState(0);
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [newRole, setNewRole] = useState(false);
  const admins = usePeople('', 'admins', 100, 0, reload);
  const search = usePeople(q.trim(), 'all', PAGE, offset, reload, q.trim() !== '');
  useEffect(() => setOffset(0), [q]);
  const changed = () => { setReload((n) => n + 1); reloadRoles(); };
  const meId = me()?.id;
  if (!admins) return <Loading />;
  const directors = admins.people.filter((p) => p.adminTier === 'director');
  const others = admins.people.filter((p) => p.adminTier !== 'director');

  return (
    <>
      <H>Directors</H>
      <P muted>Directors have every permission and manage admins and roles. You can have several, but never none — add the new director before the old one steps down.</P>
      {directors.map((p) => (
        <Card key={p.id}>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: C.ink }}>{fullName(p)}{p.id === meId ? ' (you)' : ''}</Text>
              <P muted>{p.email}</P>
            </View>
            <Chip label="Director" color={C.accent} />
          </View>
          {directors.length > 1
            ? link(p.id === meId ? 'Step down as director…' : 'Remove director…', () => confirm(p.id === meId ? 'Step down?' : 'Remove director?',
                `${p.id === meId ? 'You' : fullName(p)} will become an Administrator.`, () => adminSetDirector(p.id, false).then(changed).catch(fail)), C.danger)
            : <P muted>The only director. To hand over, make someone else a director first, then step down.</P>}
        </Card>
      ))}

      <H>Roles</H>
      <P muted>Roles bundle permissions. Create one for each job (for example "Athletics Director" with calendar and notifications), then assign it below.</P>
      {roles.map((r) => <RoleCard key={`${r.id}:${r.name}:${r.permissions.join()}`} role={r} catalog={catalog} onChange={changed} />)}
      {newRole ? <RoleCard role={null} catalog={catalog} onChange={changed} startOpen onCancel={() => setNewRole(false)} />
        : <Button label="+ New role" kind="ghost" onPress={() => setNewRole(true)} />}

      <H>People with admin access</H>
      {others.length === 0 ? <P muted>Nobody else yet.</P>
        : others.map((p) => <AccessCard key={`${p.id}:${p.adminTier}:${p.granted.join()}`} p={p} roles={roles} catalog={catalog} onChange={changed} />)}

      <H>Give someone access</H>
      <Field label="Find a person" placeholder="Name or email" autoCapitalize="none" value={q} onChangeText={setQ} />
      {q.trim() !== '' && (!search ? <Loading /> : (
        <>
          {search.people.filter((p) => !p.pending && p.adminTier !== 'director').map((p) =>
            <AccessCard key={`${p.id}:${p.adminTier}:${p.granted.join()}`} p={p} roles={roles} catalog={catalog} onChange={changed} />)}
          {search.total === 0 && <P muted>Nobody matches.</P>}
          <Pager offset={offset} total={search.total} onPage={setOffset} />
        </>
      ))}
    </>
  );
}

// ------------------------------------------------------------------ activity log

/** "user.deleted" → "User deleted", for the activity log. */
export const actionLabel = (action: string) => {
  const t = action.replace(/[._]/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};
/** Who did it, from the people directory. */
export const personName = (id: string | null) => { const p = id ? getUser(id) : undefined; return p ? fullName(p) : 'Someone'; };

function Audit() {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { listAudit().then(setRows).catch((e) => { setRows([]); fail(e); }); }, []);
  if (!rows) return <Loading />;
  const name = personName;
  return rows.length === 0 ? <P muted>No activity yet.</P> : (
    <>{rows.map((a) => (
      <Card key={a.id}>
        <Text style={{ fontWeight: '700', color: C.ink }}>{actionLabel(a.action)}</Text>
        <P muted>{name(a.actor_id)}{a.groups?.name ? ` · ${a.groups.name}` : ''} · {new Date(a.at).toLocaleString()}</P>
        {a.target_id && getUser(a.target_id) && <P muted>→ {name(a.target_id)}</P>}
      </Card>
    ))}</>
  );
}

/**
 * Admin tools that live in their app, by the permission that opens them: the portal lists the
 * ones this admin holds, so nobody has to remember where each went.
 */
type Icon = ComponentProps<typeof Ionicons>['name'];
export const ELSEWHERE: { perm: string; label: string; where: string; href: Href; icon: Icon }[] = [
  { perm: 'push.send', label: 'Send a notification', where: 'Notifications (the bell)', href: '/notifications/send', icon: 'megaphone-outline' },
  { perm: 'push.send', label: 'A/B tests', where: `${SCHOOL.newsName} → the gear`, href: '/experiments', icon: 'flask-outline' },
  { perm: 'alerts.send', label: 'Send critical alerts', where: 'Alerts', href: '/alerts', icon: 'warning-outline' },
  { perm: 'alerts.map', label: 'Alert map', where: 'Alerts', href: '/alerts/map', icon: 'wifi-outline' },
  { perm: 'questions.manage', label: 'Route questions', where: 'Ask the School → All questions', href: '/questions', icon: 'git-branch-outline' },
  { perm: 'checkin.manage', label: 'Check students in and out', where: 'Classes', href: '/checkin', icon: 'log-in-outline' },
  { perm: 'checkin.manage', label: 'On-site attendance and visitors', where: 'Classes', href: '/onsite', icon: 'location-outline' },
  { perm: 'people.family', label: 'Extended care students and staff', where: 'Classes → Extended care', href: '/extended-care', icon: 'home-outline' },
  { perm: 'subs.manage', label: 'Schedule substitutes', where: 'Classes → Substitutes', href: '/subs', icon: 'swap-horizontal-outline' },
  { perm: 'messages.review', label: 'Student messages', where: 'Classes → Messages', href: '/teachers', icon: 'chatbubbles-outline' },
  { perm: 'lunch.manage', label: 'Lunch times and rules', where: 'Lunch Visits', href: '/lunch/settings', icon: 'restaurant-outline' },
  { perm: 'calendar.school', label: 'School calendar and dress-up days', where: 'Calendar', href: '/calendar', icon: 'calendar-outline' },
  { perm: 'forms.send', label: 'Send forms to grades or the school', where: 'Forms', href: '/forms', icon: 'document-text-outline' },
  { perm: 'sports.manage', label: 'Add activities and coaches', where: 'Activities', href: '/activities', icon: 'basketball-outline' },
  { perm: 'gallery.manage', label: 'Photo albums and categories', where: 'Photos', href: '/photos', icon: 'images-outline' },
  { perm: 'feedback.triage', label: 'Triage feedback', where: 'Feedback → Triage', href: '/feedback', icon: 'chatbubble-ellipses-outline' },
];

/** The portal's own sections: the dashboard's tiles, each its own screen (/admin/<key>), for the permission that opens it. */
export const SECTIONS: { key: 'people' | 'students' | 'classes' | 'admins' | 'activity'; title: string; sub: string; icon: Icon; perm: string }[] = [
  { key: 'people', title: 'People', sub: 'Approve accounts, roles and families', icon: 'people-outline', perm: 'people.view' },
  { key: 'students', title: 'Students', sub: 'Children, family requests, logins', icon: 'school-outline', perm: 'people.family' },
  { key: 'classes', title: 'Classes', sub: 'Sections, teachers and students', icon: 'easel-outline', perm: 'people.family' },
  { key: 'admins', title: 'Admins & roles', sub: 'Directors, roles and permissions', icon: 'key-outline', perm: 'admins.manage' },
  { key: 'activity', title: 'Activity log', sub: 'Who changed what, and when', icon: 'time-outline', perm: 'audit.view' },
];

/** People, with the admin roles its cards name (`filter`: start on one, like Needs approval). */
export function PeopleSection({ access, filter }: { access: Access; filter?: PeopleFilter }) {
  const [roles, setRoles] = useState<AdminRole[]>([]);
  useEffect(() => { adminRoles().then(setRoles).catch(() => setRoles([])); }, []);
  return <People access={access} roles={roles} initialFilter={filter} />;
}

/** Admins & roles (directors), with the permission catalog. */
export function AdminsSection() {
  const [catalog, setCatalog] = useState<PermissionInfo[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const loadRoles = useCallback(() => { adminRoles().then(setRoles).catch(() => setRoles([])); }, []);
  useEffect(() => { permissionCatalog().then(setCatalog).catch(fail); loadRoles(); }, [loadRoles]);
  return <Admins catalog={catalog} roles={roles} reloadRoles={loadRoles} />;
}

export const ActivitySection = Audit;
export const PEOPLE_FILTERS = FILTERS.map(([k]) => k);
