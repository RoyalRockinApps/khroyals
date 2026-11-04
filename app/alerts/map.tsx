/**
 * Alerts → Alert map (alerts.map: directors, administrators, IT): the school's Wi-Fi access points
 * and the room each one is in (src/alerts/AlertMapPanel.tsx). Admin powers, so it asks for the
 * authenticator code first. It used to be the Admin portal's Alert map tab.
 */
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { AlertMapPanel } from '../../src/alerts/AlertMapPanel';
import { MfaGate } from '../../src/comms/MfaGate';
import { Card, P, s } from '../../src/ui';

export default function AlertMap() {
  return (
    <>
      <Stack.Screen options={{ title: 'Alert map' }} />
      <MfaGate>{(access) => access.permissions.includes('alerts.map') ? (
        <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
          <AlertMapPanel />
        </ScrollView>
      ) : (
        <View style={[s.screen, s.pad]}><Card><P muted>The Alert map is for admins with "Alert map".</P></Card></View>
      )}</MfaGate>
    </>
  );
}
