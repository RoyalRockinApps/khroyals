/**
 * A splash page's video (an uploaded .mp4): plays at once, silently and on a loop, like a GIF, so it never startles
 * anyone opening the app; the speaker button turns the sound on. Other apps' audio keeps playing while it's muted.
 */
import { useEffect, useState } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';

export function SplashVideo({ uri, label, style }: { uri: string; label: string; style?: StyleProp<ViewStyle> }) {
  const [muted, setMuted] = useState(true);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  // On the web the first play() comes before the video element is on the page; play again once it is.
  useEffect(() => { player.play(); }, [player]);
  const toggle = () => {
    player.muted = !muted;
    setMuted(!muted);
  };
  return (
    <View style={style} accessibilityLabel={label}>
      <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls={false} allowsPictureInPicture={false} />
      <Pressable onPress={toggle} hitSlop={10} accessibilityRole="button" accessibilityLabel={muted ? 'Turn the sound on' : 'Turn the sound off'}
        style={{ position: 'absolute', right: 14, bottom: 14, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
          backgroundColor: '#0008' }}>
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={22} color="#fff" />
      </Pressable>
    </View>
  );
}
