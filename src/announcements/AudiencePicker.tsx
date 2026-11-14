/**
 * Who an announcement is for: everyone, roles, grades, academies, classes (teachers' boards), a group or picked people;
 * for grades, academies and classes, their parents and/or the students. `onNames` hands back the names of what's
 * picked, for the label the history shows.
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  listAcademies, listMyGroups, listUsers, myBoards, type Academy, type Audience, type Board, type Person,
} from '../api/connect';
import { boardHeading } from '../boards/decor';
import { GRADES } from '../comms/grades';
import type { Group } from '../comms/types';
import { C, Input, P, s } from '../ui';
import { KINDS, ROLE_CHOICES, blankAudience } from './kinds';

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
        borderWidth: 1.5, borderColor: on ? C.primary : C.line, backgroundColor: on ? `${C.primary}14` : C.card }, pressed && { opacity: 0.7 }]}>
      {on && <Ionicons name="checkmark" size={14} color={C.primary} />}
      <Text style={{ fontWeight: '700', fontSize: 13, color: on ? C.primary : C.ink }}>{label}</Text>
    </Pressable>
  );
}

const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

export function AudiencePicker({ value, onChange, onNames }: { value: Audience; onChange: (a: Audience) => void; onNames: (n: Record<string, string>) => void }) {
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [q, setQ] = useState('');
  const kind = value.kind;

  useEffect(() => {
    if (kind === 'academies' && !academies.length) listAcademies().then(setAcademies).catch(() => {});
    if (kind === 'classes' && !boards.length) myBoards().then((b) => setBoards(b.filter((x) => x.kind === 'teacher'))).catch(() => {});
    if (kind === 'group' && !groups.length) listMyGroups().then(setGroups).catch(() => {});
    if (kind === 'people' && !people.length) listUsers().then((p) => setPeople(p.filter((x) => !x.pending))).catch(() => {});
  }, [kind, academies.length, boards.length, groups.length, people.length]);

  // Names of what's picked, for the history's label.
  useEffect(() => {
    const names: Record<string, string> = {};
    for (const a of academies) names[a.id] = a.name;
    for (const b of boards) names[b.id] = `${boardHeading(b).title} (${boardHeading(b).byline})`;
    for (const g of groups) names[g.id] = g.name;
    for (const p of people) names[p.id] = `${p.firstName} ${p.lastName}`.trim();
    onNames(names);
  }, [academies, boards, groups, people]); // eslint-disable-line react-hooks/exhaustive-deps

  const whoToggles = (a: { parents: boolean; students: boolean }) => (
    <View style={[s.row, { gap: 8, flexWrap: 'wrap' }]}>
      <Text style={{ color: C.muted, fontWeight: '700' }}>Send to</Text>
      <Chip label="Parents" on={a.parents} onPress={() => onChange({ ...value, parents: !a.parents } as Audience)} />
      <Chip label="Students" on={a.students} onPress={() => onChange({ ...value, students: !a.students } as Audience)} />
    </View>
  );
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = <T,>(list: T[], text: (x: T) => string) => list.filter((x) => words.every((w) => text(x).toLowerCase().includes(w)));

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {KINDS.map((k) => <Chip key={k.key} label={k.label} on={kind === k.key} onPress={() => { setQ(''); onChange(blankAudience(k.key)); }} />)}
      </View>

      {value.kind === 'everyone' && <P muted>Every approved account: parents, students, staff and family.</P>}

      {value.kind === 'roles' && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ROLE_CHOICES.map((r) => <Chip key={r.key} label={r.label} on={value.roles.includes(r.key)} onPress={() => onChange({ ...value, roles: toggle(value.roles, r.key) })} />)}
        </View>
      )}

      {value.kind === 'grades' && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {GRADES.map((g) => <Chip key={g.value} label={g.short} on={value.grades.includes(g.value)} onPress={() => onChange({ ...value, grades: toggle(value.grades, g.value) })} />)}
          </View>
          {whoToggles(value)}
        </>
      )}

      {value.kind === 'academies' && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {academies.map((x) => <Chip key={x.id} label={x.name} on={value.academies.includes(x.id)} onPress={() => onChange({ ...value, academies: toggle(value.academies, x.id) })} />)}
          </View>
          {academies.length === 0 && <P muted>This school has no academies set up yet.</P>}
          {whoToggles(value)}
        </>
      )}

      {value.kind === 'classes' && (
        <>
          {boards.length > 8 && <Input placeholder="Find a teacher or class" value={q} onChangeText={setQ} autoCorrect={false} />}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {matches(boards, (b) => `${boardHeading(b).title} ${b.teacherName ?? ''} ${b.byline}`).map((b) => (
              <Chip key={b.id} label={`${boardHeading(b).title} · ${boardHeading(b).byline}`} on={value.boards.includes(b.id)}
                onPress={() => onChange({ ...value, boards: toggle(value.boards, b.id) })} />
            ))}
          </View>
          {whoToggles(value)}
        </>
      )}

      {value.kind === 'group' && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {groups.map((g) => <Chip key={g.id} label={g.name} on={value.group === g.id} onPress={() => onChange({ ...value, group: g.id })} />)}
          {groups.length === 0 && <P muted>Groups you're in show up here.</P>}
        </View>
      )}

      {value.kind === 'people' && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {value.people.map((pid) => {
              const p = people.find((x) => x.id === pid);
              return <Chip key={pid} label={p ? `${p.firstName} ${p.lastName}` : '…'} on onPress={() => onChange({ ...value, people: value.people.filter((x) => x !== pid) })} />;
            })}
          </View>
          <Input placeholder="Search by name" value={q} onChangeText={setQ} autoCorrect={false} />
          {words.length > 0 && matches(people.filter((p) => !value.people.includes(p.id)), (p) => `${p.firstName} ${p.lastName}`).slice(0, 6).map((p) => (
            <Text key={p.id} accessibilityRole="button" onPress={() => { setQ(''); onChange({ ...value, people: [...value.people, p.id] }); }}
              style={{ color: C.primary, fontWeight: '700', paddingVertical: 4 }}>+ {p.firstName} {p.lastName}</Text>
          ))}
        </>
      )}
    </View>
  );
}
