package com.yaochn.auroraprimeoffice;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.webkit.JavascriptInterface;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.*;
import org.json.JSONObject;

/** Fixed-endpoint asynchronous services; no document contents or hardware identifiers. */
public final class CubeOfficeServices {
  private final Activity activity;
  private final SharedPreferences preferences;
  private final String clientId;
  private final ExecutorService executor = Executors.newSingleThreadExecutor();
  private final ConcurrentHashMap<String, String> results = new ConcurrentHashMap<>();
  private final java.util.Set<String> pending = ConcurrentHashMap.newKeySet();

  CubeOfficeServices(Activity activity) {
    this.activity = activity;
    preferences = activity.getSharedPreferences("cubeoffice-services", Context.MODE_PRIVATE);
    // Excluded from Android backup: a restored installation gets a fresh identity.
    File file = new File(activity.getNoBackupFilesDir(), "client-id");
    try {
      String id =
          file.exists()
              ? new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8).trim()
              : "";
      if (!id.matches("[a-zA-Z0-9_-]{20,80}")) {
        id = UUID.randomUUID().toString();
        Files.write(file.toPath(), id.getBytes(StandardCharsets.UTF_8));
      }
      clientId = id;
    } catch (IOException error) {
      throw new IllegalStateException("Cannot persist client identity", error);
    }
  }

  private JSONObject identity() throws Exception {
    android.content.pm.PackageInfo info =
        activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
    return new JSONObject()
        .put("client_id", clientId)
        .put("version", info.versionName)
        .put(
            "versionCode",
            Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode)
        .put("platform", "android")
        .put("arch", Build.SUPPORTED_ABIS[0])
        .put("locale", Locale.getDefault().toLanguageTag())
        .put("sdk", Build.VERSION.SDK_INT);
  }

  @JavascriptInterface
  public String getInfo() {
    try {
      return identity()
          .put("automatic", preferences.getBoolean("automatic", false))
          .put("lastCheck", preferences.getLong("lastCheck", 0))
          .toString();
    } catch (Exception error) {
      return "{}";
    }
  }

  @JavascriptInterface
  public void setAutomatic(boolean enabled) {
    preferences.edit().putBoolean("automatic", enabled).apply();
  }

  @JavascriptInterface
  public void copyClientId() {
    activity.runOnUiThread(
        () ->
            ((ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE))
                .setPrimaryClip(ClipData.newPlainText("CubeOffice clientId", clientId)));
  }

  @JavascriptInterface
  public String request(String operation, String input) {
    if (!(operation.equals("updates") || operation.equals("feedback"))
        || input == null
        || input.length() > 12000
        || !pending.add(operation)) return "";
    String id = UUID.randomUUID().toString();
    executor.execute(
        () -> {
          JSONObject response = new JSONObject();
          try {
            JSONObject payload = identity();
            JSONObject data;
            if (operation.equals("updates")) {
              data = http("https://cubexp.com/updates/android/latest.json", null);
              if (!data.has("versionCode")
                  || !data.has("versionName")
                  || !data.has("url")
                  || !data.has("sha256")) throw new IOException("更新信息不完整，请稍后重试");
              // Statistics must never prevent users from checking for a new version.
              try {
                http("https://cubexp.com/api/v1/update-checks", payload);
              } catch (Exception ignored) {
              }
              preferences.edit().putLong("lastCheck", System.currentTimeMillis()).apply();
            } else {
              JSONObject form = new JSONObject(input);
              String message = form.optString("message").trim();
              String contact = form.optString("contact").trim();
              if (message.length() < 10 || message.length() > 8000 || contact.length() > 200)
                throw new IOException("请填写 10–8000 字的问题描述，联系方式最多 200 字");
              payload
                  .put("category", form.optString("category", "other"))
                  .put("message", message)
                  .put("contact", contact);
              if (form.optBoolean("includeSystem"))
                payload.put(
                    "system_info",
                    new JSONObject()
                        .put("os", "Android " + Build.VERSION.RELEASE)
                        .put("sdk", Build.VERSION.SDK_INT));
              data = http("https://cubexp.com/api/v1/feedback", payload);
              if (data.optString("feedback_id").isEmpty())
                throw new IOException("服务器未返回反馈编号，请稍后确认");
            }
            response.put("ok", true).put("data", data);
          } catch (Exception error) {
            try {
              response
                  .put("ok", false)
                  .put("error", error instanceof IOException ? error.getMessage() : "请求失败，请稍后重试");
            } catch (Exception ignored) {
            }
          } finally {
            pending.remove(operation);
          }
          results.put(id, response.toString());
          activity.runOnUiThread(
              () -> new android.os.Handler().postDelayed(() -> results.remove(id), 120000));
        });
    return id;
  }

  @JavascriptInterface
  public String takeResult(String id) {
    String result = results.remove(id);
    return result == null ? "" : result;
  }

  private JSONObject http(String address, JSONObject payload) throws Exception {
    HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
    connection.setConnectTimeout(10000);
    connection.setReadTimeout(10000);
    connection.setInstanceFollowRedirects(false);
    connection.setUseCaches(false);
    connection.setRequestProperty("Accept", "application/json");
    try {
      if (payload != null) {
        connection.setRequestMethod("POST");
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        try (OutputStream out = connection.getOutputStream()) {
          out.write(payload.toString().getBytes(StandardCharsets.UTF_8));
        }
      }
      int status = connection.getResponseCode();
      if (status == 429) throw new IOException("操作过于频繁，请稍后重试");
      if (status < 200 || status >= 300) throw new IOException("服务暂不可用（" + status + "），请稍后重试");
      try (InputStream in = connection.getInputStream();
          ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
        byte[] chunk = new byte[4096];
        int count;
        while ((count = in.read(chunk)) != -1) {
          bytes.write(chunk, 0, count);
          if (bytes.size() > 65536) throw new IOException("服务器响应过大");
        }
        return new JSONObject(bytes.toString("UTF-8"));
      }
    } finally {
      connection.disconnect();
    }
  }

  void close() {
    executor.shutdownNow();
    results.clear();
  }
}
