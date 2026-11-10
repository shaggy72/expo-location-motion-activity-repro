# expo-location motion activity repro (Android)

A minimal app for two problems in `expo-location` 58.0.20 on Android
(`android/src/main/java/expo/modules/location/LocationModule.kt`):

- **A. Crash:** `RuntimeException: Error receiving broadcast Intent { act=expo.modules.location.MOTION_ACTIVITY_UPDATE }`
  caused by `java.util.ConcurrentModificationException`. `mMotionActivityWatchIds` is a plain `mutableSetOf<Int>()`.
  `mMotionActivityReceiver.onReceive` iterates it on the main thread, while `watchMotionActivityImplAsync` and
  `removeWatchAsync` add and remove ids from the module's queue. Every `getMotionActivityAsync()` call does one add and one remove.
- **B. Promise never settles:** if a `getMotionActivityAsync()` call is pending when the activity goes to the background,
  `pauseMotionActivityWatch()` removes the updates and unregisters the receiver but keeps the watch ids. From then on,
  `startMotionActivityWatch()` sees `alreadyRunning == true` and returns without registering anything. Every later
  `getMotionActivityAsync()` (for example from a background location task) never resolves or rejects until the app
  comes back to the foreground.

## Run

```sh
npm install
npx expo run:android --variant release   # a development build works too; Expo Go is not enough
adb logcat -s ReactNativeJS AndroidRuntime
```

Use a physical device (Activity Recognition needs Google Play services and real motion).

### Scenario A (crash)
1. Tap **A. Stress getMotionActivityAsync**. Grant location and physical activity permissions.
2. Keep the app open and move the phone around (walk with it).
3. Sooner or later the app crashes with `ConcurrentModificationException` in `onReceive` (it's a race, so it can take a while).

### Scenario B (hang)
1. Tap **B. Start background location task**. Grant permissions, including "Allow all the time" for location.
2. Logcat shows `task #n settled in … ms` for every update.
3. Press Home while the task runs.
4. Logcat now shows `task #n still pending after … s` for every new update; none of them settle.
5. Open the app again: the pending calls all settle at once.

Expected: calls in the background either resolve or reject; they should never stay pending.
