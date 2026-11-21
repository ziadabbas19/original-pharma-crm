package com.originalpharma.crm;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

/**
 * Exports (CSV files) from the app: the WebView cannot download a file it built itself, so the page
 * hands the bytes over here. "save" opens Android's own "Save as" screen (Downloads, Drive, ...);
 * "share" opens the share sheet (WhatsApp, e-mail, ...). Files for sharing are written to the app's
 * cache, which the FileProvider in AndroidManifest.xml already exposes.
 */
@CapacitorPlugin(name = "FileShare")
public class FileSharePlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        if (call.getString("base64") == null) {
            call.reject("base64 is required");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mimeType", "application/octet-stream"));
        intent.putExtra(Intent.EXTRA_TITLE, safeName(call.getString("filename", "export")));
        try {
            startActivityForResult(call, intent, "saveResult");
        } catch (ActivityNotFoundException e) {
            call.reject("No app can save files on this device", "unavailable", e);
        }
    }

    @ActivityCallback
    private void saveResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.resolve(outcome("saved", false));
            return;
        }
        Uri target = data.getData();
        try (OutputStream out = getContext().getContentResolver().openOutputStream(target)) {
            if (out == null) {
                throw new IOException("No output stream for " + target);
            }
            out.write(Base64.decode(call.getString("base64", ""), Base64.DEFAULT));
        } catch (IOException | IllegalArgumentException e) {
            call.reject("Could not save the file", e);
            return;
        }
        call.resolve(outcome("saved", true));
    }

    @PluginMethod
    public void share(PluginCall call) {
        String name = safeName(call.getString("filename", "export"));
        String type = call.getString("mimeType", "application/octet-stream");
        String base64 = call.getString("base64");
        if (base64 == null) {
            call.reject("base64 is required");
            return;
        }
        try {
            File folder = new File(getContext().getCacheDir(), "exports");
            if (!folder.isDirectory() && !folder.mkdirs()) {
                throw new IOException("Cannot create " + folder);
            }
            File file = new File(folder, name);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(Base64.decode(base64, Base64.DEFAULT));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);

            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(type);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.setClipData(ClipData.newRawUri(name, uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, call.getString("title", name));
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
        } catch (IOException | IllegalArgumentException | ActivityNotFoundException e) {
            call.reject("Could not share the file", e);
            return;
        }
        call.resolve(outcome("shared", true));
    }

    private static JSObject outcome(String key, boolean value) {
        JSObject result = new JSObject();
        result.put(key, value);
        return result;
    }

    /** File names come from the page; keep them to one plain file name. */
    private static String safeName(String name) {
        String cleaned = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        return cleaned.isEmpty() ? "export" : cleaned;
    }
}
