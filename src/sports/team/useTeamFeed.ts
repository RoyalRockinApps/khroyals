/**
 * An activity's bulletin board and parent chat for its page, kept live: the board for the team, the chat for its
 * parents and leaders. `unread` counts other people's messages since this phone last opened the chat (`markSeen`).
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sportBulletins, sportChat, subscribeTeam, type SportBulletin, type SportChatMessage } from '../../api/connect';

const seenKey = (sportId: string) => `khroyals.activities.chatSeen.${sportId}`;

export function useTeamFeed(sportId: string, onTeam: boolean, inChat: boolean, meId: string | null) {
  const [bulletins, setBulletins] = useState<SportBulletin[]>([]);
  const [chat, setChat] = useState<SportChatMessage[]>([]);
  // When this phone last saw the chat: undefined while it's read from storage, null when never.
  const [seen, setSeen] = useState<string | null | undefined>(undefined);

  const reload = useCallback(async () => {
    const [b, c] = await Promise.all([
      onTeam ? sportBulletins(sportId).catch(() => []) : Promise.resolve([]),
      inChat ? sportChat(sportId).catch(() => []) : Promise.resolve([]),
    ]);
    setBulletins(b);
    setChat(c);
  }, [sportId, onTeam, inChat]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => (onTeam || inChat ? subscribeTeam(sportId, reload) : undefined), [sportId, onTeam, inChat, reload]);
  useEffect(() => {
    let on = true;
    AsyncStorage.getItem(seenKey(sportId)).then((v) => on && setSeen(v)).catch(() => on && setSeen(null));
    return () => { on = false; };
  }, [sportId]);

  const unread = seen === undefined ? 0 : chat.filter((m) => m.authorId !== meId && (!seen || m.createdAt > seen)).length;
  const last = chat[chat.length - 1]?.createdAt;
  const markSeen = useCallback(() => {
    if (!last || last === seen) return;
    setSeen(last);
    AsyncStorage.setItem(seenKey(sportId), last).catch(() => {});
  }, [last, seen, sportId]);

  return { bulletins, chat, reload, unread, markSeen };
}
