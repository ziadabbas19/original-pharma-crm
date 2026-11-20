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
| `location-drift` | check-in further than the drift settings from the clinic, the earlier visits' median or the previous visit (see below) |
| `clinic-location-not-saved` | first visit to a customer without a location, with a fix that was not good enough to save |

The visit is always saved and marked for review (`visits.needs_review`, `trust_reasons`), with one flag per visit
on the review page. Leaving the clinic before checking out is normal, so only a check-out beyond the max distance
is marked. The existing refusal of check-in fixes worse than `Visits:MaxAccuracyMeters` (100 m; the app retries
with high accuracy) is unchanged.

### Clinic locations and visit history

**New doctors need no location.** Adding a doctor from the rep app asks for no position; the doctor is usable at once.
The dashboard can still type coordinates (customers:manage).

**The first good visit saves the clinic location.** When a rep checks in at a doctor (or pharmacy) with no saved
location, the visit is never refused for it. If the fix is good, it becomes the clinic location
(`customers.location`) with `location_source = first visit`, the rep (`location_captured_by_id`), the time
(`location_captured_at`), the accuracy and the visit (`location_visit_id`). A good fix means:

- no mock flag on the fix;
- no spoofing app selected, no emulator, no root signals and no known spoofing app installed;
- accuracy within the weak-fix setting, and not unrealistically precise;
- no suspicious tracking points of the rep around the visit.

Otherwise the visit is kept with the review reason `clinic-location-not-saved` and a flag on the review page, the
doctor keeps no location, and the next visit tries again. Two first visits at the same moment cannot both save one:
the update only applies while the location is still empty, and the other visit is then measured against it.

**A saved location never moves by itself.** Later visits are checked against it as before (geofence, max distance,
accuracy allowance, speed checks on the points). Only a manager edit changes it, which records
`location_source = manager set`, the manager and the time. Locations saved before this change are marked as set by
a manager.

**Every visit keeps its own location and how it compares.** At check-in the visit stores its position, accuracy,
device time (as sent), mock flag and device signal codes, the distance from the clinic location, and how it
compares with **every earlier visit to the same doctor** (all reps) whose check-in was a good fix (`check_in_good_fix`):

| Column | Meaning |
| --- | --- |
| `clinic_distance_meters` | distance from the saved clinic location (empty when there was none) |
| `previous_visit_id`, `previous_visit_distance_meters`, `since_previous_visit_seconds` | the latest earlier good visit |
| `median_distance_meters` | distance from the median latitude and median longitude of the earlier good visits (at least two) |
| `nearest_visit_distance_meters` | distance to the closest earlier good visit |
| `reference_visit_count` | how many earlier visits were compared (at most `Tracking:Trust:MaxReferenceVisits`, newest first) |
| `location_drift`, `drift_sources` | see below |

The numbers are stored when the visit is recorded, so a visit's history never changes later. The median is used
instead of the mean so that one bad visit among many good ones does not pull the reference away from the clinic.
Check-out also stores its device time and device signal codes next to its position and distance.

**Location drift** (`location-drift`): the check-in is further than the setting allows from the clinic
(`clinic`), from the median of at least two earlier good visits (`median`), or from the previous good visit
(`previous`). Part of the fix accuracy is credited first, as for "far from doctor". Drift marks the visit for review
and raises (or extends) the visit's flag on the review page; the rep is never blocked.

Older visits count as references when they were recorded within the geofence plus 50 m of the saved location, had
no mock flag, no "low trust" reason and an accuracy of 100 m or better.

**Dashboard.** Doctors: a "Clinic location" column and, per doctor, a sheet with the saved location (source, saved by
and when, accuracy), a map with the clinic, its geofence, every visit numbered by date (1 is the oldest) and the
median, and the visit list with accuracy, distance from the clinic, from the previous visit and from the median,
and drift or flagged badges. The edit dialog shows the typed location on a small map. Visits: a location column
(opens the point on OpenStreetMap), the same distances, badges and a "Location drift only" filter; the visit details
show the check-in, check-out and clinic on a map. Live map: an optional layer with the doctors that have a clinic
location. Everything follows the caller's scope: the doctor must be in their customers:read scope and only visits
in their visits:read scope are listed (supervisor: team, area manager: territory, sales manager and admin: all).

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

## Location visibility (visits only)

**Rule.** With the default setting *During visits only* (`visit_only`), a manager sees where a rep is only from the
start of each visit to its end, widened by a buffer (default 5 minutes) on both sides, and the stored visit points
afterwards. Outside those windows the rep is on no map and in no trail. The rule is enforced by the API (and the live
channel), not only by the dashboard: every response and push that would carry a rep's position to someone else is
filtered by `VisitWindowService`. *All working day* (`all_day`) keeps the previous behaviour.

A visit window is `check-in − buffer` to `check-out + buffer`; a visit still running is open until now; archived
visits make no window.

| Where positions reach managers | Change in visit-only mode |
| --- | --- |
| `GET /api/tracking/monitor/presence` (live map, dashboard counts) | `position` only while the rep is on a visit or within the buffer after it, and only when it was recorded in that window; otherwise `null`, status `notOnVisit`, `locationHidden`, `lastVisitEndedAt`. A rep on a visit carries `onVisit`, the visit and its doctor's name, and `visibleUntil` once it ended |
| SignalR `PositionUpdated` | pushed only for a point inside a visit window, with the visit's doctor; nothing between visits |
| SignalR `PresenceChanged` | check-in pushes `online`, check-out and the start of the day push `notOnVisit` (status only, no coordinates) |
| `GET /api/tracking/monitor/history/{userId}` (trail, rep detail) | only points inside the visit windows of the range |
| `GET /api/tracking/integrity/events`, `/events/{id}` (suspicious activity) | coordinates of points outside the windows are left out (`lat`/`lng` empty, `locationHidden`); time, reasons and accuracy stay. No map link for such an event |
| Flag details (`tracking_flags.details`, `/api/tracking/monitor/flags`, notifications) | the app's own mock-location report no longer writes the position into the text |
| `GET /api/tracking/monitor/visibility` (new) | the mode and buffer, for the live map's banner |
| Shift start and end positions | not stored (they are outside any visit) |

Reviewed and unchanged because they carry no rep position: device list (`/api/tracking/monitor/devices`), flags
list (apart from the text above), statistics and their CSV exports (distances and counts only; distances now only
cover visit time), order exports, suspicious-location notifications (rep, reasons, score), the activity log, and
visit endpoints (the check-in and check-out points are the visit itself). Live view can still be requested; in
visit-only mode the phone only reports during visits anyway.

**What the app collects.** The server tells the app the mode in `GET /api/tracking/config` (`collectionMode`). In
visit-only mode the background tracker is off when the day starts, starts when a visit is opened on the phone
(also offline) and stops when it is closed; the check-in and check-out fixes are taken on their own as before. App
open and resume, "End my day" and signing out bring the tracker in line, so no tracker is left running after a visit
or after logout. The setup wizard is unchanged (the app still needs "Allow all the time" to keep collecting while a
visit runs in the background). In all-day mode the app behaves as before. Older apps that ignore `collectionMode`
keep sending all day; the server then applies the rules below.

**Retention.** A point recorded outside every visit window is still checked (mock flag, movement, device signals),
but stored with `outside_visit_window` and never shown. An hourly job (`outside-visit-points-purge`) deletes such
points after `Tracking:Trust:OutsideVisitGraceHours` (12 h), unless a check-in queued offline arrived in the meantime
and covers them (they then become visit points; check-in and check-out also claim them at once), or a suspicious
activity flag refers to them (kept as evidence, shown without coordinates). Points stored before visit-only mode, or
in all-day mode, follow the existing retention.

**Anti-fraud checks that changed.**

| Check | Before | Visit-only |
| --- | --- | --- |
| Impossible speed / teleport between points | between consecutive points all day | between consecutive points, which are now during visits; the last point of one visit to the first of the next still counts (the latest position is kept internally) |
| Speed between visits | only through the points | new at check-in: from where the rep's previous visit ended (or started) to this check-in; faster than the max plausible speed (and further than the jitter allowance) adds `impossible-speed` to the visit and its flag, in both modes |
| Tracking lost | no point for 30 min during the day | only while a visit is in progress: no point for 30 min since the check-in or the last point |
| Suspicious points around a visit (`low-trust`) | 15 min before check-in until check-out | the same window, but before the check-in there are usually no points now |
| Frozen position, still while moving, zero altitude, repeated accuracy | runs of points all day | runs of points during visits |
| Distance travelled (statistics, live map) | whole day | only visit time |

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
| Drift from the clinic from | 150 m (`Tracking:Trust:DriftFromClinicMeters`) | 20–10000 | "location drift" from the saved clinic location |
| Drift from earlier visits from | 150 m (`Tracking:Trust:DriftFromVisitsMeters`) | 20–10000 | "location drift" from the median of the earlier visits and from the previous visit |
| Location visibility | During visits only (`Tracking:Trust:LocationVisibility`) | During visits only / All working day | see [Location visibility](#location-visibility-visits-only) |
| Visit buffer | 5 min (`Tracking:Trust:VisitWindowBufferMinutes`) | 0–60 | positions stay visible this long before check-in and after check-out |

**Policy.** *Flag only*: mock points and visits are marked and reviewed and still count everywhere. *Flag and
exclude*: they are also left out of the distance travelled (statistics, live map summary) and of attendance, meaning
visits with a mock check-in or check-out are not counted in the visit statistics and doctor coverage. Rejected points
never count in distances, whatever the policy. The policy applies to past data too, because it is applied when the
numbers are computed.

Configuration only (no dashboard field): `Tracking:Trust:OutsideVisitGraceHours` (12), `Tracking:Trust:MaxReferenceVisits` (50), `Tracking:Trust:NotificationThrottleMinutes` (60),
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

> **عربي:** يشارك التطبيق موقعك مع الشركة أثناء زياراتك فقط (والدقائق القليلة قبلها وبعدها)، ولا يظهر موقعك خارج الزيارات. إذا كان على هاتفك تطبيق موقع وهمي (Fake GPS) مختار في خيارات
> المطوّر، فسيطلب منك التطبيق إيقافه، وستُعرض المواقع والزيارات المسجلة أثناء تشغيله على مشرفك للمراجعة. لن يمنعك
> التطبيق من العمل. ضعف إشارة GPS داخل المباني لا يُعتبر مخالفة. لإيقاف الموقع الوهمي: الإعدادات > خيارات المطوّر >
> اختيار تطبيق الموقع الوهمي > لا شيء.
>
> **English:** The app shares your location with the company only during your visits (and a few minutes before and
> after them); outside visits your location is not shown. If a fake GPS app is selected in
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
| `GET` / `PUT` | `/api/settings/location-trust` (new optional fields: `driftFromClinicMeters`, `driftFromVisitsMeters`, `visibility`, `visitWindowBufferMinutes`) | `settings:manage` |
| `GET` | `/api/tracking/monitor/visibility` | `tracking:view-live` |
| `GET` | `/api/doctors/{id}/location-history` | `customers:read` (visits filtered by `visits:read` scope) |
| `GET` | `/api/visits?locationDrift=true` (list rows and details now carry a `location` object) | `visits:read` |

Older apps keep working: every new field is optional, and an unreadable `deviceTime` is ignored instead of
refusing the batch (a refused batch would block the phone's upload queue).
