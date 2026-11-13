/** The F.A.Q.s are at the bottom of Ask the School now (src/questions/FaqSection.tsx); old links go there. */
import { Redirect } from 'expo-router';

export default function Faq() {
  return <Redirect href="/questions" />;
}
