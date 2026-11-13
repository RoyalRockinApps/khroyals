/** Profile → My vehicles: what you drive to pickup, so car line staff know the car (src/carline/MyVehicles.tsx). */
import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { MyVehicles } from '../../src/carline/MyVehicles';
import { s } from '../../src/ui';

export default function Vehicles() {
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Stack.Screen options={{ title: 'My vehicles' }} />
      <MyVehicles heading={false} />
    </ScrollView>
  );
}
