/**
 * An A/B test's results, as app/experiments/[key].tsx shows them: whether a version is really ahead (src/experiments/stats.ts),
 * each version's counts and rates, start / stop, and start over. Counts only.
 */
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ExperimentResults } from '../api/connect';
import { Button, C, Card, H, P, ask, s } from '../ui';
import { EVENTS, EXPERIMENTS, variantLabel } from './registry';
import { pct, verdict } from './stats';

const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];
const GREEN = '#15803D';
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function ResultsView({ r, busy, onRun: run, onRefresh }: {
  r: ExperimentResults; busy: boolean; onRun: (active: boolean, reset?: boolean) => void; onRefresh?: () => void;
}) {
  const info = EXPERIMENTS[r.key];
  const status = r.active ? `Running since ${r.startedAt ? day(r.startedAt) : 'today'}`
    : r.stoppedAt ? `Stopped ${day(r.stoppedAt)}` : 'Not started';
  const [a, b] = r.variants;
  const compare = (event: 'opened' | 'finished', what: string) => (a && b
    ? verdict(what, { hits: a[event], of: a.seen, label: variantLabel(r.key, a.variant) }, { hits: b[event], of: b.seen, label: variantLabel(r.key, b.variant) })
    : null);
  const verdicts = [compare('opened', 'opens'), compare('finished', 'reads')].filter(Boolean) as ReturnType<typeof verdict>[];

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={onRefresh ? <RefreshControl refreshing={false} onRefresh={onRefresh} /> : undefined}>
      <H>{info?.title ?? r.title}</H>
      <View style={[s.row, { gap: 6 }]}>
        <Ionicons name={r.active ? 'radio-button-on' : 'pause-circle-outline'} size={16} color={r.active ? GREEN : C.muted} />
        <Text style={{ color: r.active ? GREEN : C.muted, fontWeight: '700' }}>
          {status}{r.subjects ? ` · ${r.subjects} ${r.subjects === 1 ? 'issue' : 'issues'} so far` : ''}
        </Text>
      </View>
      {!!info?.where && <P muted>{info.where}</P>}
      <Button label={busy ? 'Saving…' : r.active ? 'Stop the test' : r.startedAt ? 'Start it again' : 'Start the test'} disabled={busy}
        onPress={() => (r.active
          ? ask('Stop the test?', 'Everyone sees version A again. The counts so far stay here.', 'Stop', () => run(false))
          : run(true))} />

      {r.startedAt && verdicts.map((v, i) => (
        <Card key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderColor: v.sure ? `${GREEN}66` : C.line }}>
          <Ionicons name={v.sure ? 'checkmark-circle' : 'time-outline'} size={20} color={v.sure ? GREEN : C.muted} />
          <Text style={{ flex: 1, color: C.ink, lineHeight: 21 }}>{v.text}</Text>
        </Card>
      ))}

      {r.variants.map((v, i) => {
        const about = info?.variants[v.variant]?.about;
        return (
          <Card key={v.variant} style={{ gap: 8, borderLeftWidth: 4, borderLeftColor: COLORS[i % COLORS.length] }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{variantLabel(r.key, v.variant)}</Text>
            {!!about && <P muted>{about}</P>}
            {EVENTS.map((e) => {
              const n = v[e.key], share = e.key === 'seen' ? null : pct({ hits: n, of: v.seen });
              return (
                <View key={e.key} style={{ gap: 4 }}>
                  <View style={s.row}>
                    <Text style={{ flex: 1, color: C.ink }}>{e.label}</Text>
                    <Text style={{ color: C.ink, fontWeight: '800' }}>
                      {n.toLocaleString()}{share != null && <Text style={{ color: C.muted, fontWeight: '600' }}>  {share}%</Text>}
                    </Text>
                  </View>
                  {share != null && (
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: C.line, overflow: 'hidden' }}>
                      <View style={{ width: `${share}%`, height: 6, borderRadius: 3, backgroundColor: COLORS[i % COLORS.length] }} />
                    </View>
                  )}
                </View>
              );
            })}
            <Text style={{ color: C.muted, fontSize: 13 }}>{v.people.toLocaleString()} {v.people === 1 ? 'person' : 'people'} so far</Text>
          </Card>
        );
      })}

      <P muted>Counts only: nobody’s name is recorded here. Everyone with an account except students is in the test, about half on each version, and keeps the same version on every device. Each person counts once per issue, and opens and reads count only after they saw it.</P>
      {!!r.startedAt && (
        <Text onPress={() => ask('Start over?', 'This clears every count so far and starts the test again from today.', 'Start over', () => run(true, true))}
          accessibilityRole="button" style={{ color: C.danger, fontWeight: '600', textAlign: 'center', paddingVertical: 8 }}>Start over (clears the counts)</Text>
      )}
    </ScrollView>
  );
}
