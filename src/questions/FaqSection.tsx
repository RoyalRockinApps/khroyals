/**
 * The school's F.A.Q.s (from its website's home page, src/site/faq.ts), at the bottom of Ask the School: every question,
 * each opening to its answer, and the site's Contact Us. Open to everyone, signed in or not.
 */
import { View } from 'react-native';
import { getHome } from '../api/mockApi';
import { faqSection } from '../site/faq';
import { SectionView } from '../site/Blocks';
import { SectionTitle } from '../volunteer/parts';
import { P, useLoad } from '../ui';

export function FaqSection() {
  const { data } = useLoad(getHome);
  const faq = data ? faqSection(data.sections) : null;
  if (!faq) return null;
  return (
    <View style={{ gap: 10, marginTop: 8 }}>
      <SectionTitle icon="help-circle-outline" title="F.A.Q.s" />
      <P muted>Quick answers about admissions, tuition, school hours and more.</P>
      <SectionView section={faq} />
    </View>
  );
}
