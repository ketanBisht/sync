import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useColorScheme, View, Text, StyleSheet } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { getDatabase } from '@/db/database';
import { bleService } from '@/services/bleService';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    async function bootstrap() {
      try {
        await getDatabase();
        await bleService.init();
        setReady(true);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[SYNC] Initialization failed:', message);
        setInitError(message);
      }
    }
    bootstrap();
  }, []);

  if (initError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Initialization Error</Text>
        <Text style={styles.errorMessage}>{initError}</Text>
      </View>
    );
  }

  if (!ready) {
    // Splash screen is still visible while db & ble initialize
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#c0392b',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
  },
});
