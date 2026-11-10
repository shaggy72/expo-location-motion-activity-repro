import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';

// Minimal reproduction for two Android issues in expo-location's motion activity code.
// All output goes to console.log, so watch it with: adb logcat -s ReactNativeJS AndroidRuntime

const TASK = 'repro-location-task';
let seq = 0;

// Calls getMotionActivityAsync() and reports whether and when it settles.
function probeMotion(label: string): Promise<void> {
  const id = ++seq;
  const started = Date.now();
  const warn = setInterval(() => {
    console.log(`[repro] ${label} #${id} still pending after ${Math.round((Date.now() - started) / 1000)} s`);
  }, 10_000);
  return Location.getMotionActivityAsync()
    .then((a) => console.log(`[repro] ${label} #${id} settled in ${Date.now() - started} ms`, JSON.stringify(a.activities)))
    .catch((e) => console.log(`[repro] ${label} #${id} rejected in ${Date.now() - started} ms: ${e}`))
    .finally(() => clearInterval(warn));
}

// Scenario B: a background location task that asks for the current motion activity on every update
// (the documented way to attach the activity to a position).
TaskManager.defineTask(TASK, async ({ data, error }) => {
  if (error) {
    console.log('[repro] task error', error.message);
    return;
  }
  const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] };
  console.log(`[repro] task: ${locations?.length ?? 0} location(s)`);
  await probeMotion('task');
});

async function askPermissions(): Promise<boolean> {
  const fg = await Location.requestForegroundPermissionsAsync();
  const bg = fg.granted ? await Location.requestBackgroundPermissionsAsync() : fg;
  const motion = await Location.requestMotionActivityPermissionsAsync();
  console.log('[repro] permissions', { fg: fg.granted, bg: bg.granted, motion: motion.granted });
  return fg.granted && motion.granted;
}

export default function App() {
  const [status, setStatus] = useState('idle');

  // Scenario A: several overlapping getMotionActivityAsync() calls in the foreground. Each call adds and
  // removes a watch id (module queue thread) while the BroadcastReceiver iterates the same set (main thread).
  async function startStress() {
    if (!(await askPermissions())) return setStatus('permissions missing');
    setStatus('stress running (4 parallel loops)');
    for (let loop = 0; loop < 4; loop++) {
      (async () => {
        for (;;) await probeMotion(`stress${loop}`);
      })();
    }
  }

  async function startTask() {
    if (!(await askPermissions())) return setStatus('permissions missing');
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 2000,
      distanceInterval: 0,
      foregroundService: { notificationTitle: 'Repro', notificationBody: 'Background location running' },
    });
    setStatus('background task running: now press Home and watch logcat');
  }

  async function stopTask() {
    if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK);
    setStatus('stopped');
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.inner}>
        <Text style={styles.title}>expo-location motion activity repro</Text>
        <Text>Status: {status}</Text>
        <View style={styles.gap} />
        <Button title="A. Stress getMotionActivityAsync (crash)" onPress={startStress} />
        <View style={styles.gap} />
        <Button title="B. Start background location task (hang)" onPress={startTask} />
        <View style={styles.gap} />
        <Button title="Stop background task" onPress={stopTask} />
      </ScrollView>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { padding: 24, paddingTop: 80 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  gap: { height: 16 },
});
