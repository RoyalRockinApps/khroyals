/**
 * An activity's roster (the Roster tab): the students on the team now, with their photo, grade and parents, for the
 * team's families and its leaders. The leaders also approve or decline the sign-ups waiting here.
 */
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { decideSportRegistration, sportRoster, type SportRegistration, type SportSeason, type TeamMember } from '../../api/connect';
import { gradeLabel } from '../../comms/grades';
import { Avatar, Button, C, Card, H, Loading, P, s } from '../../ui';
import { confirmThen, fail, nameOf } from './parts';

export function Roster({ sportId, leader, regs, seasons, onChange }: {
  sportId: string; leader: boolean; regs: SportRegistration[]; seasons: SportSeason[]; onChange: () => void;
}) {
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Reloaded whenever a sign-up is approved, declined or withdrawn.
  const key = regs.map((r) => `${r.id}:${r.status}`).join();
  useEffect(() => {
    let on = true;
    sportRoster(sportId).then((t) => { if (on) { setTeam(t); setError(null); } }).catch((e) => on && setError(e.message ?? String(e)));
    return () => { on = false; };
  }, [sportId, key]);

  const pending = leader ? regs.filter((r) => r.status === 'pending') : [];
  const seasonName = (id: string) => seasons.find((x) => x.id === id)?.name ?? '';
  const decide = (r: SportRegistration, approve: boolean) => {
    const go = () => decideSportRegistration(r.id, approve).then(onChange).catch(fail);
    if (approve) go(); else confirmThen(`Decline ${nameOf(r.studentId)}'s sign-up?`, 'Their parents are told.', 'Decline', go);
  };

  return (
    <View style={{ gap: 12 }}>
      {pending.length > 0 && (
        <Card style={{ gap: 8, borderColor: '#F59E0B' }}>
          <H>Waiting for you ({pending.length})</H>
          {pending.map((r) => (
            <View key={r.id} style={{ gap: 4, borderTopWidth: 1, borderColor: C.line, paddingTop: 8 }}>
              <Text style={{ fontWeight: '700', color: C.ink }}>{nameOf(r.studentId)} · {seasonName(r.seasonId)}</Text>
              <P muted>From {nameOf(r.requestedBy)}{r.note ? `: “${r.note}”` : ''}</P>
              <View style={[s.row, { justifyContent: 'flex-end' }]}>
                <Button label="Decline" kind="ghost" onPress={() => decide(r, false)} />
                <Button label="Approve" onPress={() => decide(r, true)} />
              </View>
            </View>
          ))}
        </Card>
      )}

      {error ? <Card><P muted>{`The roster couldn't load: ${error}`}</P></Card> : !team ? <Loading /> : team.length === 0 ? (
        <Card><P muted>No one is on the team yet. Students show up here once their sign-up is approved.</P></Card>
      ) : (
        <>
          <Text style={{ fontSize: 13, fontWeight: '800', color: C.muted, letterSpacing: 0.5 }}>
            {team.length} ON THE TEAM
          </Text>
          <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }}>
            {team.map((m, i) => (
              <View key={m.studentId} accessible style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14,
                borderTopWidth: i ? 1 : 0, borderColor: C.line }}>
                <Avatar person={m} size={46} />
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{m.firstName} {m.lastName}</Text>
                  <Text style={{ color: C.muted, fontSize: 13 }}>
                    {[m.grade == null ? '' : m.grade > 0 ? `${gradeLabel(m.grade)} grade` : gradeLabel(m.grade), seasons.length > 1 ? m.seasons.join(', ') : ''].filter(Boolean).join(' · ')}
                  </Text>
                  {m.parents.length > 0 && (
                    <Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={1}>{m.parents.length > 1 ? 'Parents' : 'Parent'}: {m.parents.join(', ')}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}
