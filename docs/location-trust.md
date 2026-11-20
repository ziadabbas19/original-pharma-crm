# Location trust (fake GPS detection)

Reps can try to look as if they were at a clinic, or hide where they are, with a "fake GPS" app chosen as the
mock location app in Android's developer options. This page explains what the system checks, what it keeps as
evidence, how supervisors review it, and what it cannot catch.

Principles:

- **Detect, keep, review. Never block.** A suspicious location is stored with its status and raised for review.
  The rep can keep working; the app only asks them to switch the fake location off.
- **A weak GPS signal is not fraud.** Jumps within the reported accuracy are ignored, the synthetic-fix checks only
  look at precise fixes, and part of the accuracy is credited when measuring the distance to a doctor.
- **Nothing is deleted.** Suspicious and impossible points stay in `location_points`; only the device details stored
  with them expire (see [Privacy](#privacy-and-retention)).

## How it works

```
Rep app (Android)                         API                                   Dashboard
  every fix: mock flag, altitude,   ──►   plausibility checks per point   ──►   Suspicious activity page
  motion activity, device time            trust status + reason codes          (per rep and day, evidence,
  every upload: device signals            flag (merged while open)              acknowledge with comment)
  mock fix: bilingual notice,             audit entry, supervisor notice        badges on live map / visits
  re-checks, report to API                (once per rep per hour)               dashboard summary, settings
```

### On the phone

| Signal | How | Notes |
| --- | --- | --- |
| Mock flag of every fix | Transistorsoft `Location.mock` (`<%= mock %>` in the location template) | Sent with every point, also when the app is closed |
| Altitude, motion activity, device time | `<%= altitude %>`, `<%= activity.type %>`, `<%= activity.confidence %>`, `<%= recorded_at %>` | Feed the server checks below |
| Developer options on | `Settings.Global.DEVELOPMENT_SETTINGS_ENABLED` | Stored for review; not suspicious on its own |
| A mock location app is selected | `AppOpsManager` check of `android:mock_location` for the known spoofing apps that are installed | Only apps on the known list can be checked (no `QUERY_ALL_PACKAGES`); `null` when none is installed |
| Known spoofing app installed | `PackageManager` lookup of the packages in `known-location-spoofing-apps.xml` | Best effort; the list needs updating over time |
| Automatic time / time zone off | `Settings.Global.AUTO_TIME`, `AUTO_TIME_ZONE` | |
| Emulator | `Build` fingerprint, model, hardware, product, manufacturer | |
| Root | `test-keys` build, `su` binary in the usual places, known root and hooking apps | Basic only, see below |

The checks that no Capacitor plugin offers live in a small local plugin,
`FRONTEND/android/app/src/main/java/com/originalpharma/crm/DeviceSignalsPlugin.java`. They are settings and package
lookups (a few milliseconds), cached for five minutes on the phone and read on app open and resume only, so they
cost no noticeable battery. The latest signals go into the background uploader's request body, so every batch
carries them, also while the app is closed.

**Known apps list.** `FRONTEND/android/app/known-location-spoofing-apps.xml` is the only copy. The build merges it
into the manifest as a `<queries>` block (Android then lets the app see exactly those packages, which keeps the
app acceptable for Google Play) and turns the package names into `BuildConfig.KNOWN_SPOOFING_APPS` and
`KNOWN_ROOT_APPS`. To update it, add or remove `<package>` lines under the right `section:` comment and build a new
APK. Check new names on their Play Store page first; a wrong name does no harm, it simply never matches.

**When the phone reports a mock fix** the rep app (`features/integrity/`):

1. shows a red notice at the top of every screen, in Arabic first and English second whatever the app language,
   asking to turn the fake location app off and continue, with a button to developer options;
2. marks tracking as not trusted on the home screen;
3. reports the event to the API (`POST /api/tracking/integrity-events`), again every 15 minutes if it lasts;
4. checks again on its own with a fresh fix after 15 s, 30 s, 60 s, then every 2 minutes, only while the app is on
   screen. The first real fix clears everything.

It never closes the app or blocks other screens. Errors in any of these steps are swallowed: the points themselves
still carry the mock flag.

### On the server

Every accepted point gets a **trust status** and the reason codes behind it (`location_points.trust_status`,
`trust_reason`, `anomaly_codes`). Batch-wide codes (clock, device signals) apply to every point of the batch.

| Code | Check | Effect on the point | Score |
| --- | --- | --- | --- |
| `mock-location` | the phone says the fix came from a mock provider | suspicious | 60 |
| `teleport` | ≥ 20 km within 5 min, or movement with no time elapsed | **rejected** | 50 |
| `impossible-speed` | faster than the max plausible speed (setting) | **rejected** | 35 |
| `mock-app-selected` | a known spoofing app is the selected mock location app | suspicious | 40 |
| `emulator` | the app runs on an emulator | suspicious | 40 |
| `future-timestamp` | fix or device time more than 5 min ahead of the server | suspicious | 25 |
| `clock-drift` | batch sent with a device clock more than 5 min off the server | suspicious | 20 |
| `frozen-position` | 5+ precise fixes (≤ 10 m) on exactly the same coordinates for 2+ min, with no GPS jitter | suspicious | 20 |
| `still-while-moving` | the phone says "still" (≥ 75 %) while the position moves ≥ 200 m at ≥ 3 m/s | suspicious | 20 |
| `perfect-accuracy` | accuracy at or below the setting (default 1.5 m) | suspicious | 15 |
| `repeated-accuracy` | the same accuracy value on N fixes in a row (setting) | suspicious | 15 |
| `zero-altitude` | 8+ precise fixes in a row with exactly 0 m altitude while moving 300 m+ | suspicious | 15 |
| `rooted-device` | root signals | kept, no change | 15 |
| `spoofing-app-installed` | a known spoofing app is installed | kept, no change | 10 |
| `ip-geo-mismatch` | GPS far from the IP location (needs GeoIP data, stub today) | kept, no change | 10 |
| `auto-time-off` | automatic time or time zone off | kept, no change | 5 |
| `location-accessory` | iOS: location from an external accessory | kept, no change | 5 |

- **Rejected** is only for physically impossible positions. A single bad fix does not drag the next good one down:
  a point that only looks impossible next to a rejected point is measured against the last good one.
- Jumps shorter than the two accuracies combined (or 300 m) are GPS jitter and never count.
- The batch score is the sum of its distinct codes (max 100). From 50 a **flag** is raised for review. While a flag
  is open, the same problem in the same working day updates it (occurrences, last seen) instead of adding new
  ones.
- A **new** flag writes an audit entry (`location_flag`, in the activity log) and, when its score reaches 50,
  notifies the rep's direct supervisor in the app, at most once per rep per hour
  (`Tracking:Trust:NotificationThrottleMinutes`).

**Visits.** At check-in and check-out the fix is compared with the doctor's saved location, crediting up to the
accuracy allowance:

| Reason | When |
| --- | --- |
| `outside-geofence` | check-in outside the doctor's radius + allowance (existing) |
| `far-from-doctor` | check-in or check-out further than the max distance from the doctor (setting) |
| `mock-location` | mock fix at check-in or check-out |
| `low-trust` | fix less accurate than the weak-fix setting, synthetic accuracy, a selected spoofing app or an emulator, or suspicious points of the rep from 15 min before the check-in until check-out |
| `no-check-out-location` | check-out without a fix (existing) |

The visit is always saved and marked for review (`visits.needs_review`, `trust_reasons`), with one flag per visit
on the review page. Leaving the clinic before checking out is normal, so only a check-out beyond the max distance
is marked. The existing refusal of check-in fixes worse than `Visits:MaxAccuracyMeters` (100 m; the app retries
with high accuracy) is unchanged.

### Review

**Tracking > Suspicious activity** (`/admin/suspicious-activity`) lists the events per rep and day with filters for
rep, dates, reason and status. Opening a day shows each event with its reasons, score, how often it repeated, the
suspicious points around it (time, device time, position, accuracy, altitude, reasons), the phone settings at that
time, and links to the visit or to the rep's route on the live map with the point marked. **Acknowledge** needs a
comment; it is kept with the event and written to the activity log. Events already confirmed or dismissed on the
Tracking flags page keep their verdict.

Badges: the live map shows "Suspicious location" or "Impossible position" on the rep's latest position, red points
on the route for suspicious fixes and grey points for points left out of the distance. Visit details show
"Location flagged" with the reasons. The dashboard has a 7-day summary; statistics have a distance column.

## Admin settings

**Administration > Settings > Location trust**, stored in `app_settings` (key `location-trust`). Until an admin saves
them, the values come from configuration. Changes apply on each API instance within 30 seconds.

| Setting | Default | Range | Meaning |
| --- | --- | --- | --- |
| Maximum plausible speed | 200 km/h (`Tracking:Anomalies:MaxSpeedKmh`) | 60–1000 | Faster movement between two fixes is rejected |
| Maximum distance from the doctor | 500 m (`Tracking:Trust:MaxDistanceFromDoctorMeters`) | 50–10000 | Check-in / check-out further away is "far from doctor" |
| Accuracy allowance | 50 m (`Visits:MaxAccuracyAllowanceMeters`) | 0–200 | Part of the fix accuracy credited to the rep, for the geofence too |
| Weak fix from | 100 m (`Visits:MaxAccuracyMeters`) | 10–500 | Visit fixes less accurate than this are "low trust" |
| Unrealistic accuracy up to | 1.5 m (`Tracking:Anomalies:SuspiciousAccuracyMeters`) | 0–10 | `perfect-accuracy` |
| Same accuracy in a row | 6 (`Tracking:Anomalies:RepeatedAccuracyRun`) | 3–50 | `repeated-accuracy` |
| Mock location policy | Flag only (`Tracking:Trust:MockPolicy`) | Flag only / Flag and exclude | see below |
| Keep phone settings for | 30 days (`Tracking:Trust:DeviceSignalsRetentionDays`) | 1–365 | see [Privacy](#privacy-and-retention) |

**Policy.** *Flag only*: mock points and visits are marked and reviewed and still count everywhere. *Flag and
exclude*: they are also left out of the distance travelled (statistics, live map summary) and of attendance, meaning
visits with a mock check-in or check-out are not counted in the visit statistics and doctor coverage. Rejected points
never count in distances, whatever the policy. The policy applies to past data too, because it is applied when the
numbers are computed.

Configuration only (no dashboard field): `Tracking:Trust:NotificationThrottleMinutes` (60),
`Tracking:Trust:VisitPointWindowMinutes` (15), `Tracking:Trust:SettingsCacheSeconds` (30) and the remaining
`Tracking:Anomalies` thresholds.

## Permissions

| Key | Who has it by default | Scope |
| --- | --- | --- |
| `tracking:review-suspicious` | Supervisor, Area manager, Sales manager, Admin | team, territory, all, all |
| `settings:manage` | Admin | all |

Both are added to existing databases by the seeder on the next start (each seeded role gets its default once;
custom roles get them from the permission matrix). A supervisor sees only their team; the API checks the scope on
every request.

## Privacy and retention

Stored only what the checks and the review need:

- per point: trust status, reason codes, device time, altitude, motion activity, and the device signals of its
  batch (the flags above, the names of **known** spoofing or root apps found, emulator and root signal names). No
  list of other installed apps is ever read or sent.
- per visit: the trust reasons; per flag: a short text with the evidence.

A daily job (`device-signals-retention`, 02:00 UTC) clears the device signals stored with points older than the
retention setting (default 30 days). Points, their status and reason codes are kept like the rest of the location
history; flag texts stay with the flag as the record of the review.

## What it cannot detect

- **Rooted phones that hide it.** With root, tools such as Magisk modules or LSPosed/Xposed hooks can remove the
  mock flag and hide the spoofing app and root itself. The root checks here are basic; Play Integrity (stubbed today)
  would be the stronger signal.
- **Hardware GPS spoofers and external GPS receivers.** A transmitter that fakes satellite signals, or a Bluetooth
  GPS feeding the phone, produces real-looking fixes with no mock flag. Only the movement checks can catch the
  result, and only when it is implausible.
- **The phone without the rep.** Leaving the phone at a clinic, giving it to someone else or carrying two phones
  looks like honest data.
- **Careful spoofing.** A fake route with realistic speed, accuracy jitter and altitude passes the plausibility
  checks; the mock flag is then the only signal.
- **Apps not on the list.** Unknown or renamed spoofing apps are not seen as installed, and "mock location app
  selected" cannot be confirmed for them.
- **Browsers.** The installable web app (iPhone today) cannot see mock providers or device settings; only the
  server-side movement checks apply.

## iPhone

Not built yet, but the API is ready: points take the same mock flag and a platform-neutral `deviceSignals` object.
On iOS 15 and later, `CLLocation.sourceInformation` tells whether a location was simulated by software
(`isSimulatedBySoftware`, which covers Xcode and most simulator tools) and whether it came from an external accessory
(`isProducedByAccessory`, sent as `locationFromAccessory`). iOS has no developer-option mock app setting and does not
let apps list or query other apps without declaring their URL schemes, so "spoofing app installed" and "mock app
selected" stay unknown; jailbreak checks are as limited as Android's root checks, and jailbroken phones can hide the
simulated flag.

## What to tell the reps

> **عربي:** يعرض التطبيق موقعك أثناء يوم العمل فقط. إذا كان على هاتفك تطبيق موقع وهمي (Fake GPS) مختار في خيارات
> المطوّر، فسيطلب منك التطبيق إيقافه، وستُعرض المواقع والزيارات المسجلة أثناء تشغيله على مشرفك للمراجعة. لن يمنعك
> التطبيق من العمل. ضعف إشارة GPS داخل المباني لا يُعتبر مخالفة. لإيقاف الموقع الوهمي: الإعدادات > خيارات المطوّر >
> اختيار تطبيق الموقع الوهمي > لا شيء.
>
> **English:** The app shares your location only during your working day. If a fake GPS app is selected in
> developer options, the app asks you to turn it off, and the locations and visits recorded while it was on are shown
> to your supervisor for review. The app never stops you from working. A weak GPS signal indoors is not a problem. To
> turn a fake location off: Settings > Developer options > Select mock location app > None.

## API

| Method | Path | Permission |
| --- | --- | --- |
| `POST` | `/api/tracking/locations` (new optional fields: `altitude`, `activityType`, `activityConfidence`, `deviceTime`, batch `deviceSignals`) | `tracking:report` |
| `POST` | `/api/tracking/integrity-events` | `tracking:report` |
| `GET` | `/api/tracking/integrity/events?from&to&userId&reason&status&type` | `tracking:review-suspicious` |
| `GET` | `/api/tracking/integrity/events/{id}` | `tracking:review-suspicious` |
| `POST` | `/api/tracking/integrity/events/{id}/acknowledge` | `tracking:review-suspicious` |
| `GET` | `/api/tracking/integrity/summary?from&to` | `tracking:review-suspicious` |
| `GET` / `PUT` | `/api/settings/location-trust` | `settings:manage` |

Older apps keep working: every new field is optional, and an unreadable `deviceTime` is ignored instead of
refusing the batch (a refused batch would block the phone's upload queue).
