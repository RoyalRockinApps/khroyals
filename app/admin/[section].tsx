/**
 * One of the Admin portal's sections, opened from its dashboard (/admin): /admin/people (`?filter=pending` starts
 * on Needs approval), /admin/students, /admin/classes, /admin/admins, /admin/activity, /admin/usage. Behind the authenticator code
 * (MfaGate) and the section's permission, like the dashboard.
 */
import { ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import type { PeopleFilter } from '../../src/api/connect';
import { ClassesPanel } from '../../src/admin/ClassesPanel';
import { ActivitySection, AdminsSection, PEOPLE_FILTERS, PeopleSection, SECTIONS } from '../../src/admin/sections';
import { StudentsPanel } from '../../src/admin/StudentsPanel';
import { UsageSection } from '../../src/admin/UsageSection';
import { MfaGate } from '../../src/comms/MfaGate';
import { Card, P, s } from '../../src/ui';

export default function AdminSection() {
  const { section, filter } = useLocalSearchParams<{ section: string; filter?: string }>();
  const def = SECTIONS.find((x) => x.key === section);
  const start = PEOPLE_FILTERS.find((f) => f === filter) as PeopleFilter | undefined;
  const box = (text: string) => <View style={[s.screen, s.pad]}><Card><P muted>{text}</P></Card></View>;
  return (
    <>
      <Stack.Screen options={{ title: def?.title ?? 'Admin portal' }} />
      <MfaGate>{(access) => (!def ? box('There’s no such page in the Admin portal.')
        : !access.permissions.includes(def.perm) ? box(`${def.title} is for admins with that permission.`)
        : (
          <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
            {def.key === 'people' && <PeopleSection access={access} filter={start} />}
            {def.key === 'students' && <StudentsPanel />}
            {def.key === 'classes' && <ClassesPanel />}
            {def.key === 'admins' && <AdminsSection />}
            {def.key === 'activity' && <ActivitySection />}
            {def.key === 'usage' && <UsageSection />}
          </ScrollView>
        ))}</MfaGate>
    </>
  );
}
