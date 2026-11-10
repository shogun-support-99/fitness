package com.ironlog.app;

import android.app.Activity;
import android.app.Dialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * IronLog's Android shell.
 *
 * <p>The whole web app is packaged in the APK. A stable HTTPS origin is served
 * from {@code assets/} through {@link WebViewClient#shouldInterceptRequest}, so
 * ES modules, fetch() and localStorage behave exactly as they do on the web.
 * No remote page is ever loaded inside the WebView, and localStorage survives
 * upgrades because the origin and application id never change.</p>
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/app/";
    private static final String SITE_ORIGIN = "https://shogun-support-99.github.io/fitness";
    private static final String VERSION_URL =
            "https://github.com/shogun-support-99/fitness/releases/latest/download/version.json";
    private static final String APK_URL =
            "https://github.com/shogun-support-99/fitness/releases/latest/download/ironlog.apk";

    private static final int REQUEST_PICK_BACKUP = 4201;
    private static final int REQUEST_EXPORT_BACKUP = 4202;
    private static final long AUTO_CHECK_INTERVAL_MS = 6L * 60L * 60L * 1000L;

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingBackupJson;
    private boolean updateCheckRunning;
    private SharedPreferences prefs;
    private final ExecutorService network = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("ironlog", MODE_PRIVATE);

        Window window = getWindow();
        window.setStatusBarColor(Color.parseColor("#0F2A1D"));
        window.setNavigationBarColor(Color.parseColor("#F2F1EC"));
        window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#F2F1EC"));
        configureWebView(webView);
        webView.addJavascriptInterface(new NativeBridge(), "IronLogNative");
        setContentView(webView);
        webView.loadUrl(START_URL);
    }

    private void configureWebView(WebView view) {
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(true);
        settings.setDefaultTextEncodingName("utf-8");
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setGeolocationEnabled(false);
        settings.setSaveFormData(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(
                settings.getUserAgentString() + " IronLogAndroid/" + BuildConfig.VERSION_NAME);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(false);
        cookies.setAcceptThirdPartyCookies(view, false);

        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                return handleNavigation(v, request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                return handleNavigation(v, Uri.parse(url));
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
                return serveAsset(request);
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                super.onPageFinished(v, url);
                v.evaluateJavascript(
                        "document.documentElement.classList.add('is-native-shell');", null);
            }
        });

        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = callback;

                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                String[] accepted = params.getAcceptTypes();
                String acceptType = "application/json";
                if (accepted != null) {
                    for (String candidate : accepted) {
                        if (candidate != null && candidate.contains("/")) {
                            acceptType = candidate;
                            break;
                        }
                    }
                }
                intent.setType(acceptType);
                try {
                    startActivityForResult(
                            Intent.createChooser(intent, "Choose an IronLog backup"),
                            REQUEST_PICK_BACKUP);
                } catch (ActivityNotFoundException error) {
                    fileCallback = null;
                    toast("No file picker is available on this device.");
                    return false;
                }
                return true;
            }

            @Override
            public void onPermissionRequest(android.webkit.PermissionRequest request) {
                request.deny();
            }
        });
    }

    private boolean handleNavigation(WebView view, Uri uri) {
        if (HOST.equals(uri.getHost())) {
            String path = uri.getPath() == null ? "/" : uri.getPath();
            if (path.equals("/app")) {
                view.loadUrl(START_URL);
                return true;
            }
            if (path.startsWith("/app/")) {
                return false;
            }
            // "About", privacy and notices are real pages on the public site.
            // Open them in the browser rather than fetching them into the shell.
            openExternal(Uri.parse(SITE_ORIGIN + path + (uri.getQuery() == null ? "" : "?" + uri.getQuery())));
            return true;
        }
        openExternal(uri);
        return true;
    }

    private void openExternal(Uri uri) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            startActivity(intent);
        } catch (ActivityNotFoundException error) {
            toast("No app can open that link.");
        }
    }

    private WebResourceResponse serveAsset(WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (!HOST.equals(uri.getHost()) || !"GET".equalsIgnoreCase(request.getMethod())) {
            return null;
        }

        String path = uri.getPath();
        if (path == null || path.contains("..")) {
            return notFound();
        }
        if (path.equals("/app") || path.equals("/app/")) {
            path = "/app/index.html";
        }
        if (!(path.startsWith("/app/") || path.startsWith("/assets/") || path.startsWith("/fonts/"))) {
            return notFound();
        }

        String assetPath = path.substring(1);
        try {
            InputStream stream = getAssets().open(assetPath);
            String mime = mimeFor(assetPath);
            Map<String, String> headers = new HashMap<>();
            // An APK upgrade replaces the assets. Never let the WebView render a
            // previous build from its HTTP cache.
            headers.put("Cache-Control", "no-cache");
            headers.put("X-Content-Type-Options", "nosniff");
            return new WebResourceResponse(mime, isText(mime) ? "UTF-8" : null, 200, "OK", headers, stream);
        } catch (FileNotFoundException missing) {
            return notFound();
        } catch (IOException error) {
            return notFound();
        }
    }

    private WebResourceResponse notFound() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        return new WebResourceResponse(
                "text/plain",
                "UTF-8",
                404,
                "Not Found",
                headers,
                new ByteArrayInputStream("Not found".getBytes(StandardCharsets.UTF_8)));
    }

    private String mimeFor(String path) {
        int dot = path.lastIndexOf('.');
        String extension = dot >= 0 ? path.substring(dot + 1).toLowerCase(Locale.US) : "";
        switch (extension) {
            case "html":
            case "htm":
                return "text/html";
            case "js":
            case "mjs":
                return "text/javascript";
            case "css":
                return "text/css";
            case "json":
            case "map":
            case "webmanifest":
                return "application/json";
            case "svg":
                return "image/svg+xml";
            case "png":
                return "image/png";
            case "jpg":
            case "jpeg":
                return "image/jpeg";
            case "gif":
                return "image/gif";
            case "webp":
                return "image/webp";
            case "ico":
                return "image/x-icon";
            case "woff2":
                return "font/woff2";
            case "woff":
                return "font/woff";
            case "ttf":
                return "font/ttf";
            case "otf":
                return "font/otf";
            case "xml":
                return "application/xml";
            case "txt":
            case "md":
                return "text/plain";
            default:
                return "application/octet-stream";
        }
    }

    private boolean isText(String mime) {
        return mime.startsWith("text/")
                || mime.contains("json")
                || mime.contains("javascript")
                || mime.contains("xml")
                || mime.contains("svg");
    }

    // ── Backup export bridge ────────────────────────────────────────────────

    /**
     * The web export path uses a Blob URL, which WebView cannot hand to the
     * download manager. Native code uses the system document picker instead, so
     * backups land wherever the user chooses without any storage permission.
     */
    public class NativeBridge {
        @JavascriptInterface
        public String getVersionName() {
            return BuildConfig.VERSION_NAME;
        }

        @JavascriptInterface
        public int getVersionCode() {
            return BuildConfig.VERSION_CODE;
        }

        @JavascriptInterface
        public void checkForUpdates() {
            runOnUiThread(() -> MainActivity.this.checkForUpdates(true));
        }

        @JavascriptInterface
        public void exportBackup(String json, String suggestedName) {
            runOnUiThread(() -> {
                pendingBackupJson = json;
                String safeName = suggestedName == null ? "ironlog-backup.json" : suggestedName;
                safeName = safeName.replaceAll("[^A-Za-z0-9._-]", "_");
                if (!safeName.endsWith(".json")) {
                    safeName += ".json";
                }
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                intent.putExtra(Intent.EXTRA_TITLE, safeName);
                try {
                    startActivityForResult(intent, REQUEST_EXPORT_BACKUP);
                } catch (ActivityNotFoundException error) {
                    pendingBackupJson = null;
                    toast("No file manager is available on this device.");
                }
            });
        }
    }

    // ── Update checks ───────────────────────────────────────────────────────

    private void checkForUpdates(boolean manual) {
        if (updateCheckRunning) {
            return;
        }
        long now = System.currentTimeMillis();
        if (!manual && now - prefs.getLong("last_check", 0L) < AUTO_CHECK_INTERVAL_MS) {
            return;
        }
        updateCheckRunning = true;
        network.execute(() -> {
            UpdateInfo info = null;
            String failure = null;
            try {
                info = fetchUpdateInfo();
            } catch (Exception error) {
                failure = error.getMessage();
            }
            UpdateInfo result = info;
            String reason = failure;
            runOnUiThread(() -> {
                updateCheckRunning = false;
                prefs.edit().putLong("last_check", System.currentTimeMillis()).apply();
                if (result == null) {
                    if (manual) {
                        toast("Could not check for updates. Try again when online.");
                    }
                    return;
                }
                if (result.versionCode > BuildConfig.VERSION_CODE) {
                    boolean dismissed = prefs.getInt("dismissed_version", 0) == result.versionCode;
                    if (manual || !dismissed) {
                        showUpdateDialog(result);
                    }
                } else if (manual) {
                    toast("IronLog is up to date.");
                }
            });
        });
    }

    private UpdateInfo fetchUpdateInfo() throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(VERSION_URL).openConnection();
        connection.setConnectTimeout(8_000);
        connection.setReadTimeout(8_000);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("User-Agent", "IronLog-Android/" + BuildConfig.VERSION_NAME);
        try {
            int status = connection.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) {
                throw new IOException("Update metadata returned HTTP " + status);
            }
            try (InputStream input = connection.getInputStream()) {
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                byte[] buffer = new byte[4096];
                int total = 0;
                int read;
                while ((read = input.read(buffer)) != -1) {
                    total += read;
                    if (total > 128 * 1024) {
                        throw new IOException("Update metadata is too large");
                    }
                    output.write(buffer, 0, read);
                }
                JSONObject json = new JSONObject(output.toString(StandardCharsets.UTF_8.name()));
                UpdateInfo info = new UpdateInfo();
                info.versionCode = json.optInt("versionCode", 0);
                info.versionName = json.optString("versionName", "new");
                info.notes = json.optString("notes", "");
                if (info.versionCode <= 0) {
                    throw new IOException("Update metadata has no versionCode");
                }
                return info;
            }
        } finally {
            connection.disconnect();
        }
    }

    private void showUpdateDialog(UpdateInfo info) {
        if (isFinishing() || webView == null) {
            return;
        }
        Dialog dialog = new Dialog(this);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        dialog.setContentView(R.layout.dialog_update);
        dialog.setCanceledOnTouchOutside(true);

        TextView version = dialog.findViewById(R.id.update_version);
        version.setText(String.format(Locale.US, "VERSION %s · BUILD %d", info.versionName, info.versionCode));
        TextView notes = dialog.findViewById(R.id.update_notes);
        notes.setText(info.notes == null || info.notes.trim().isEmpty()
                ? "This build includes the latest app code and fixes. Your log stays exactly where it is."
                : info.notes);

        dialog.findViewById(R.id.update_later).setOnClickListener(v -> {
            prefs.edit().putInt("dismissed_version", info.versionCode).apply();
            dialog.dismiss();
        });
        dialog.findViewById(R.id.update_now).setOnClickListener(v -> {
            prefs.edit().putInt("dismissed_version", info.versionCode).apply();
            dialog.dismiss();
            openApkDownload();
        });

        dialog.show();
        Window window = dialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            int width = getResources().getDisplayMetrics().widthPixels - dp(40);
            window.setLayout(width, ViewGroup.LayoutParams.WRAP_CONTENT);
        }
    }

    private void openApkDownload() {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(APK_URL));
            startActivity(intent);
        } catch (ActivityNotFoundException error) {
            toast("Could not open the download. Visit github.com/shogun-support-99/fitness/releases.");
        }
    }

    private static class UpdateInfo {
        int versionCode;
        String versionName;
        String notes;
    }

    // ── Activity lifecycle ──────────────────────────────────────────────────

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
        checkForUpdates(false);
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.onPause();
        }
        super.onPause();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_PICK_BACKUP) {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(
                        WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                fileCallback = null;
            }
            return;
        }
        if (requestCode == REQUEST_EXPORT_BACKUP) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null
                    && pendingBackupJson != null) {
                try (OutputStream output = getContentResolver()
                        .openOutputStream(data.getData(), "wt")) {
                    if (output == null) {
                        throw new IOException("No writable stream");
                    }
                    output.write(pendingBackupJson.getBytes(StandardCharsets.UTF_8));
                    output.flush();
                    toast("Backup saved.");
                    if (webView != null) {
                        webView.evaluateJavascript(
                                "window.__ironlogNativeBackupSaved&&window.__ironlogNativeBackupSaved()",
                                null);
                    }
                } catch (Exception error) {
                    toast("Could not save that backup.");
                }
            }
            pendingBackupJson = null;
        }
    }

    @Override
    protected void onDestroy() {
        network.shutdownNow();
        if (webView != null) {
            webView.removeJavascriptInterface("IronLogNative");
            webView.loadUrl("about:blank");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }
}
