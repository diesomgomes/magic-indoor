package com.magicindor.player;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final String TAG = "MagicindorPlayer";

    private static final String API_BASE = "https://magic.vartec.com.br";
    private static final long POLL_INTERVAL_MS = 10_000;
    private static final int TIMEOUT_MS = 6_000;

    private WebView player;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private String deviceCode;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );

        deviceCode = computeDeviceCode();

        player = new WebView(this);
        player.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                view.evaluateJavascript("window.setDeviceCode(" + JSONObject.quote(deviceCode) + ");", null);
            }
        });
        WebSettings settings = player.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        setContentView(player);
        player.loadUrl("file:///android_asset/player.html");

        startSync();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        executor.shutdownNow();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        // Keep the player in presentation mode; exit through the system controls.
    }

    private String computeDeviceCode() {
        String androidId = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
        if (androidId == null || androidId.isEmpty()) androidId = "demodevice";
        return String.format(Locale.US, "MI-%s", androidId.substring(0, Math.min(6, androidId.length())).toUpperCase(Locale.US));
    }

    // Nao ha registro automatico pela rede: o dispositivo so passa a existir quando o dono
    // da conta digita este codigo no painel (Dispositivos -> Vincular dispositivo). Ate la,
    // o polling abaixo so recebe 404 e a tela fica mostrando o codigo para essa vinculacao.
    private void startSync() {
        handler.postDelayed(syncRunnable, 500);
    }

    private final Runnable syncRunnable = new Runnable() {
        @Override
        public void run() {
            executor.submit(MainActivity.this::pollCampaigns);
            handler.postDelayed(this, POLL_INTERVAL_MS);
        }
    };

    private String densityBucket(int densityDpi) {
        if (densityDpi <= DisplayMetrics.DENSITY_LOW) return "ldpi";
        if (densityDpi <= DisplayMetrics.DENSITY_MEDIUM) return "mdpi";
        if (densityDpi <= DisplayMetrics.DENSITY_HIGH) return "hdpi";
        if (densityDpi <= DisplayMetrics.DENSITY_XHIGH) return "xhdpi";
        if (densityDpi <= DisplayMetrics.DENSITY_XXHIGH) return "xxhdpi";
        return "xxxhdpi";
    }

    private void pollCampaigns() {
        try {
            DisplayMetrics metrics = getResources().getDisplayMetrics();
            String url = API_BASE + "/api/devices/" + deviceCode + "/campaigns"
                    + "?screenWidth=" + metrics.widthPixels
                    + "&screenHeight=" + metrics.heightPixels
                    + "&screenDensity=" + densityBucket(metrics.densityDpi);
            String response = httpRequest(url, "GET", null);
            if (response == null) throw new IOException("resposta vazia");
            JSONObject json = new JSONObject(response);
            JSONArray items = json.optJSONArray("items");
            if (items == null) items = new JSONArray();

            JSONArray playlist = new JSONArray();
            for (int i = 0; i < items.length(); i++) {
                JSONObject sourceItem = items.getJSONObject(i);
                JSONObject item = new JSONObject();
                item.put("id", sourceItem.optLong("id", -1));
                String kind = sourceItem.optString("media_kind", "imagem");
                if ("web".equals(kind)) {
                    item.put("url", sourceItem.optString("source_url", ""));
                } else {
                    item.put("url", API_BASE + "/uploads/" + sourceItem.optString("file_name", ""));
                }
                item.put("kind", kind);
                item.put("duration", sourceItem.optInt("duration_seconds", 8));
                item.put("fitMode", sourceItem.optString("fit_mode", "original"));
                item.put("orientation", sourceItem.optString("orientation", "horizontal"));
                playlist.put(item);
            }

            String playlistJson = playlist.toString();
            handler.post(() -> updatePlaylist(playlistJson));
        } catch (Exception e) {
            Log.w(TAG, "Falha ao consultar campanhas: " + e.getMessage());
            handler.post(this::showWaiting);
        }
    }

    private void updatePlaylist(String playlistJson) {
        String js = "window.updatePlaylist(" + JSONObject.quote(playlistJson) + ");";
        player.evaluateJavascript(js, null);
    }

    private void showWaiting() {
        player.evaluateJavascript("window.showWaiting();", null);
    }

    private String httpRequest(String urlStr, String method, String jsonBody) throws IOException {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(urlStr).openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            if (jsonBody != null) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(jsonBody.getBytes(StandardCharsets.UTF_8));
                }
            }
            int status = connection.getResponseCode();
            InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
            if (stream == null) return null;
            StringBuilder result = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) result.append(line);
            }
            return result.toString();
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

}
