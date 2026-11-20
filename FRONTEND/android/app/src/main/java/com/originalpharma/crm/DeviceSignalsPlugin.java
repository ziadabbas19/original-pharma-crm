package com.originalpharma.crm;

import android.app.AppOpsManager;
import android.content.ContentResolver;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONObject;

/**
 * Device settings that make a location less trustworthy and that no Capacitor plugin exposes:
 * developer options, a mock location app, known spoofing apps, automatic time, emulator and basic
 * root signals. Every check is a cheap settings or package lookup; the result is cached for a few
 * minutes, so calling it on every app resume costs nothing noticeable.
 *
 * Only the packages listed in known-location-spoofing-apps.xml are visible to the app (no
 * QUERY_ALL_PACKAGES), so "mock location app selected" can only be confirmed for those apps and is
 * null when none of them is installed. The mock flag on each location fix stays the main signal.
 */
@CapacitorPlugin(name = "DeviceSignals")
public class DeviceSignalsPlugin extends Plugin {

    private static final long CACHE_MS = 5 * 60_000L;

    private static final String[] SU_PATHS = {
        "/system/bin/su",
        "/system/xbin/su",
        "/sbin/su",
        "/su/bin/su",
        "/system/su",
        "/system/bin/failsafe/su",
        "/system/sd/xbin/su",
        "/data/local/su",
        "/data/local/bin/su",
        "/data/local/xbin/su",
        "/vendor/bin/su",
    };

    private JSObject cached;
    private long cachedAt;

    @PluginMethod
    public void getSignals(PluginCall call) {
        boolean force = Boolean.TRUE.equals(call.getBoolean("force", false));
        JSObject result;
        synchronized (this) {
            long now = SystemClock.elapsedRealtime();
            if (force || cached == null || now - cachedAt > CACHE_MS) {
                cached = collect();
                cachedAt = now;
            }
            result = cached;
        }
        call.resolve(result);
    }

    private JSObject collect() {
        Context context = getContext();
        ContentResolver resolver = context.getContentResolver();
        PackageManager packages = context.getPackageManager();

        JSObject out = new JSObject();
        out.put("platform", "android");
        out.put("collectedAt", isoNow());
        out.put("developerOptionsEnabled", globalFlag(resolver, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0));
        out.put("autoTimeEnabled", globalFlag(resolver, Settings.Global.AUTO_TIME, 1));
        out.put("autoTimeZoneEnabled", globalFlag(resolver, Settings.Global.AUTO_TIME_ZONE, 1));

        List<String> spoofing = installed(packages, BuildConfig.KNOWN_SPOOFING_APPS);
        out.put("spoofingApps", new JSArray(spoofing));
        Boolean mockApp = mockLocationAppSelected(context, packages, spoofing);
        out.put("mockLocationAppSelected", mockApp == null ? JSONObject.NULL : mockApp);

        List<String> root = rootSignals(installed(packages, BuildConfig.KNOWN_ROOT_APPS));
        out.put("rooted", !root.isEmpty());
        out.put("rootSignals", new JSArray(root));

        List<String> emulator = emulatorSignals();
        out.put("emulator", !emulator.isEmpty());
        out.put("emulatorSignals", new JSArray(emulator));
        return out;
    }

    /** True/false from Settings.Global, or JSON null when the setting cannot be read. */
    private static Object globalFlag(ContentResolver resolver, String name, int fallback) {
        try {
            return Settings.Global.getInt(resolver, name, fallback) == 1;
        } catch (RuntimeException e) {
            return JSONObject.NULL;
        }
    }

    private static List<String> installed(PackageManager packages, String[] names) {
        List<String> found = new ArrayList<>();
        for (String name : names) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    packages.getPackageInfo(name, PackageManager.PackageInfoFlags.of(0));
                } else {
                    packages.getPackageInfo(name, 0);
                }
                found.add(name);
            } catch (PackageManager.NameNotFoundException | RuntimeException ignored) {
                // not installed (or not visible to this app)
            }
        }
        return found;
    }

    /**
     * Whether one of the visible spoofing apps is the "mock location app" chosen in developer
     * options. Null when there is nothing visible to check.
     */
    private static Boolean mockLocationAppSelected(Context context, PackageManager packages, List<String> candidates) {
        AppOpsManager appOps = (AppOpsManager) context.getSystemService(Context.APP_OPS_SERVICE);
        if (appOps == null || candidates.isEmpty()) {
            return null;
        }

        boolean checked = false;
        for (String name : candidates) {
            try {
                ApplicationInfo info = packages.getApplicationInfo(name, 0);
                int mode = appOps.checkOpNoThrow(AppOpsManager.OPSTR_MOCK_LOCATION, info.uid, name);
                checked = true;
                if (mode == AppOpsManager.MODE_ALLOWED) {
                    return true;
                }
            } catch (PackageManager.NameNotFoundException | RuntimeException ignored) {
                // uninstalled meanwhile, or the platform refused the check
            }
        }
        return checked ? Boolean.FALSE : null;
    }

    /** Basic signals only: a determined user can hide root (e.g. Magisk with a renamed app). */
    private static List<String> rootSignals(List<String> rootApps) {
        List<String> signals = new ArrayList<>();
        for (String app : rootApps) {
            signals.add("app:" + app);
        }
        String tags = Build.TAGS;
        if (tags != null && tags.contains("test-keys")) {
            signals.add("test-keys");
        }
        for (String path : SU_PATHS) {
            if (new File(path).exists()) {
                signals.add("su-binary");
                break;
            }
        }
        return signals;
    }

    private static List<String> emulatorSignals() {
        List<String> signals = new ArrayList<>();
        String fingerprint = lower(Build.FINGERPRINT);
        String model = lower(Build.MODEL);
        String hardware = lower(Build.HARDWARE);
        String product = lower(Build.PRODUCT);
        String manufacturer = lower(Build.MANUFACTURER);
        String brand = lower(Build.BRAND);
        String device = lower(Build.DEVICE);

        if (fingerprint.startsWith("generic") || fingerprint.contains("emulator") || fingerprint.contains("sdk_gphone")) {
            signals.add("fingerprint");
        }
        if (model.contains("google_sdk") || model.contains("emulator") || model.contains("android sdk built for") || model.startsWith("sdk_gphone")) {
            signals.add("model");
        }
        if (hardware.equals("goldfish") || hardware.equals("ranchu") || hardware.contains("vbox86")) {
            signals.add("hardware");
        }
        if (product.startsWith("sdk") || product.contains("emulator") || product.contains("simulator") || product.contains("vbox86p")) {
            signals.add("product");
        }
        if (manufacturer.contains("genymotion")) {
            signals.add("manufacturer");
        }
        if (brand.startsWith("generic") && device.startsWith("generic")) {
            signals.add("brand");
        }
        return signals;
    }

    private static String lower(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT);
    }

    private static String isoNow() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }
}
