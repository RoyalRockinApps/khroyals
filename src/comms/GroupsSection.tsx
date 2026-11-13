/**
 * Groups (once the whole Connect tab, now under the bulletin boards on the Boards tab): the groups someone is in,
 * folded until tapped, with + New group, the ones they hid or archived, and more groups to join.
 */
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { hideGroup, joinGroup, type Person } from '../api/connect';
import { MODE_LABELS } from './presets';
import { canCreateGroup } from './permissions';
import type { Group } from './types';
import { Button, C, Card, Chip, P, s } from '../ui';

function GroupRow({ g, onPress, action }: { g: Group; onPress?: () => void; action?: React.ReactNode }) {
  return (
    <Card onPress={onPress} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: g.color + '22', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 22 }}>{g.icon}</Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontWeight: '700', color: C.ink }}>{g.name}{g.settings.locked ? '  🔒' : ''}</Text>
        {!!g.description && <P muted>{g.description}</P>}
        <View style={s.row}><Chip label={MODE_LABELS[g.settings.mode].title} color={g.color} /><Chip label={g.settings.visibility} color={C.muted} /></View>
      </View>
      {action}
    </Card>
  );
}

export type GroupLists = { mine: Group[]; discover: Group[]; hidden: Group[]; archived: Group[] };

export function GroupsSection({ person, lists, onChange }: { person: Person; lists: GroupLists; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState<'hidden' | 'archived' | null>(null);
  const { mine, discover, hidden, archived } = lists;
  const count = mine.length;
  return (
    <View style={{ gap: 10 }}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }}
        style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: C.card,
          borderWidth: 1, borderColor: C.line }, pressed && { opacity: 0.8 }]}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${C.primary}14`, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="people" size={22} color={C.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '800', fontSize: 16, color: C.ink }}>Groups</Text>
          <P muted>{count ? `${count === 1 ? '1 group' : `${count} groups`} you're in` : 'Clubs, teams and other groups'}</P>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={C.muted} />
      </Pressable>
      {open && (
        <>
          {canCreateGroup(person) && <Button label="+ New group" onPress={() => router.push('/group/new')} />}
          {mine.length === 0 && <P muted>You're not in any groups yet.</P>}
          {mine.map((g) => <GroupRow key={g.id} g={g} onPress={() => router.push(`/group/${g.id}`)} />)}

          {([['hidden', 'HIDDEN FROM MY LIST', hidden], ['archived', 'ARCHIVED (ONLY OWNERS SEE THEM)', archived]] as const).map(([key, label, list]) =>
            list.length > 0 && (
              <View key={key} style={{ gap: 8 }}>
                <Text onPress={() => setMore(more === key ? null : key)} accessibilityRole="button" accessibilityState={{ expanded: more === key }}
                  style={{ fontSize: 12, fontWeight: '700', color: C.muted, marginTop: 8 }}>
                  {label} ({list.length}) {more === key ? '▾' : '▸'}
                </Text>
                {more === key && list.map((g) => (
                  <GroupRow key={g.id} g={g} onPress={() => router.push(`/group/${g.id}`)}
                    action={key === 'hidden'
                      ? <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => hideGroup(g.id, false).then(onChange).catch((e) => Alert.alert('Not allowed', e.message))}>Show</Text>
                      : <Text style={{ color: C.muted, fontSize: 12 }}>Restore or delete in its settings</Text>} />
                ))}
              </View>
            ))}

          {discover.length > 0 && (
            <>
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted, marginTop: 8 }}>MORE GROUPS</Text>
              {discover.map((g) => (
                <GroupRow key={g.id} g={g}
                  onPress={g.settings.visibility === 'public' || g.settings.visibility === 'school' ? () => router.push(`/group/${g.id}`) : undefined}
                  action={g.settings.joinPolicy === 'open'
                    ? <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => joinGroup(g.id).then(onChange).catch((e) => Alert.alert('Not allowed', e.message))}>Join</Text>
                    : <Text style={{ color: C.muted, fontSize: 12 }}>{g.settings.joinPolicy === 'request' ? 'Ask a moderator' : 'By invitation'}</Text>} />
              ))}
            </>
          )}
        </>
      )}
    </View>
  );
}
