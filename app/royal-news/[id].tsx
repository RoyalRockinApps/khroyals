/** One Royal News issue (src/news/IssueView.tsx lays it out like the school's Smore newsletter). */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { getNewsletter, live, myAccess } from '../../src/api/connect';
import { IssueView } from '../../src/news/IssueView';
import { Loading, P, s, useLoad } from '../../src/ui';
import { SCHOOL } from '../../src/school';

export default function Issue() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error } = useLoad(async () => ({ issue: await getNewsletter(id) }), [id]);
  const [canEdit, setCanEdit] = useState(false);
  useEffect(() => { if (live) myAccess().then((a) => setCanEdit(!!a?.permissions.includes('push.send'))).catch(() => {}); }, []);
  const header = <Stack.Screen options={{ title: SCHOOL.newsName }} />;
  if (error) return <View style={[s.screen, s.pad]}>{header}<P>{SCHOOL.newsName} didn't load: {error}</P></View>;
  if (!data) return <>{header}<Loading /></>;
  const { issue } = data;
  if (!issue) return <View style={[s.screen, s.pad]}>{header}<P>That issue isn't here anymore.</P></View>;
  return <IssueView issue={issue} canEdit={canEdit} header={header} />;
}
