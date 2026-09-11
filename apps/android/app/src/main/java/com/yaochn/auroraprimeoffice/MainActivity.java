package com.yaochn.auroraprimeoffice;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.database.Cursor;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.json.JSONException;
import org.json.JSONObject;

public final class MainActivity extends Activity {
  private static final int REQUEST_OPEN_DOCUMENT = 4101;
  private static final int REQUEST_SAVE_DOCUMENT = 4102;
  private static final int REQUEST_ASSISTANT_OPEN_DOCUMENT = 4103;
  private static final String ACTION_ASSISTANT_SUFFIX = ".action.ASSISTANT";
  private static final String LOCAL_APP_URL = "file:///android_asset/web/index.html";
  // The Web shell reports appReady() right after Vue mounts; this only guards
  // against a payload that never gets that far, so the user is not left behind
  // an overlay with no way to see the WebView's own error page.
  private static final long STARTUP_SPLASH_TIMEOUT_MS = 20_000;
  private static final String[] OFFICE_MIME_TYPES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-visio.drawing",
    "application/vnd.sas.jmp",
    "application/x-jmp",
    "application/x-jmp-data-table",
    "application/vnd.jgraph.mxfile",
    "application/x-drawio",
    "application/pdf",
    "text/markdown",
    "text/plain",
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "text/csv",
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/emf",
    "image/wmf",
    "application/emf",
    "application/wmf",
    "application/x-emf",
    "application/x-wmf",
    "application/x-msmetafile",
    "application/octet-stream"
  };

  private WebView webView;
  private View startupSplash;
  private final Runnable startupSplashTimeout = this::hideStartupSplash;
  private CubeOfficeServices cubeOfficeServices;
  private ValueCallback<Uri[]> pendingFileSelection;
  private AuroraDocumentBridge documentBridge;
  private boolean backDispatchPending;
  private boolean presentationImmersive;
  private OnBackInvokedCallback backCallback;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    configureSystemBars();

    webView = new WebView(this);
    webView.setBackgroundColor(getColor(R.color.aurora_surface));
    documentBridge = new AuroraDocumentBridge();
    configureWebView(webView);
    FrameLayout root = new FrameLayout(this);
    root.addView(
        webView,
        new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
    startupSplash = createStartupSplash();
    root.addView(
        startupSplash,
        new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
    startupSplash.postDelayed(startupSplashTimeout, STARTUP_SPLASH_TIMEOUT_MS);
    setContentView(root);
    configureWindowInsets();
    if (Build.VERSION.SDK_INT >= 33) {
      backCallback = this::onBackPressed;
      getOnBackInvokedDispatcher()
          .registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
    }
    documentBridge.receiveIntent(getIntent());
    webView.loadUrl(LOCAL_APP_URL);
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    if (documentBridge == null || !documentBridge.receiveIntent(intent)) return;
    notifyWebOfPendingIntent();
  }

  /**
   * Native stand-in for the first Web paint. The editor payload is several megabytes of JavaScript
   * that the WebView has to read from the APK and compile before Vue can mount, and until then the
   * WebView is an empty surface. Drawing the app mark and a spinner in the very first frame keeps
   * the launch from reading as a frozen blank screen; the Web shell removes it through appReady()
   * as soon as the home screen exists.
   */
  private View createStartupSplash() {
    LinearLayout splash = new LinearLayout(this);
    splash.setOrientation(LinearLayout.VERTICAL);
    splash.setGravity(Gravity.CENTER);
    splash.setBackgroundColor(getColor(R.color.aurora_surface));
    // Swallow touches so taps during startup do not reach a half-built page.
    splash.setClickable(true);
    splash.setContentDescription(getString(R.string.startup_loading, getString(R.string.app_name)));

    ImageView mark = new ImageView(this);
    mark.setImageResource(R.drawable.app_icon);
    mark.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
    int markSize = dp(96);
    splash.addView(mark, new LinearLayout.LayoutParams(markSize, markSize));

    ProgressBar progress = new ProgressBar(this);
    progress.setIndeterminate(true);
    LinearLayout.LayoutParams progressLayout =
        new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    progressLayout.topMargin = dp(32);
    splash.addView(progress, progressLayout);

    TextView label = new TextView(this);
    label.setText(getString(R.string.startup_loading, getString(R.string.app_name)));
    label.setTextColor(getColor(R.color.aurora_text_secondary));
    label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
    LinearLayout.LayoutParams labelLayout =
        new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    labelLayout.topMargin = dp(12);
    splash.addView(label, labelLayout);
    return splash;
  }

  private int dp(int value) {
    return Math.round(
        TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP, value, getResources().getDisplayMetrics()));
  }

  private void hideStartupSplash() {
    View splash = startupSplash;
    if (splash == null) return;
    startupSplash = null;
    splash.removeCallbacks(startupSplashTimeout);
    splash.setClickable(false);
    splash
        .animate()
        .alpha(0f)
        .setDuration(150)
        .withEndAction(
            () -> {
              android.view.ViewParent parent = splash.getParent();
              if (parent instanceof android.view.ViewGroup) {
                ((android.view.ViewGroup) parent).removeView(splash);
              }
            })
        .start();
  }

  private void notifyWebOfPendingIntent() {
    if (webView == null) return;
    webView.evaluateJavascript("window.dispatchEvent(new Event('aurora-native-document'))", null);
  }

  private void configureWindowInsets() {
    // Android 15 enforces edge-to-edge. Inset the WebView itself, including
    // the IME, so fixed Web controls and modal dialogs share a safe viewport.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      getWindow().setDecorFitsSystemWindows(false);
      getWindow()
          .getDecorView()
          .setOnApplyWindowInsetsListener(
              (view, insets) -> {
                Insets bars =
                    insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                Insets ime = insets.getInsets(WindowInsets.Type.ime());
                android.view.ViewGroup.MarginLayoutParams layout =
                    (android.view.ViewGroup.MarginLayoutParams) webView.getLayoutParams();
                layout.setMargins(
                    presentationImmersive ? 0 : bars.left,
                    presentationImmersive ? 0 : bars.top,
                    presentationImmersive ? 0 : bars.right,
                    Math.max(presentationImmersive ? 0 : bars.bottom, ime.bottom));
                webView.setLayoutParams(layout);
                return WindowInsets.CONSUMED;
              });
      getWindow().getDecorView().requestApplyInsets();
    }
  }

  private void configureSystemBars() {
    Window window = getWindow();
    // Keep the mobile editing toolbar in the resized WebView directly above
    // the IME. Some OEM builds do not reliably apply the manifest setting
    // when a WebView owns the focused contenteditable, so set it explicitly.
    window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
    // Android 15 draws transparent system bars over the window background.
    // Refresh it on a live theme change as well as the legacy bar colours.
    window.setBackgroundDrawable(
        new android.graphics.drawable.ColorDrawable(getColor(R.color.aurora_surface)));
    window.setStatusBarColor(getColor(R.color.aurora_system_bar));
    window.setNavigationBarColor(getColor(R.color.aurora_system_bar));
    window
        .getDecorView()
        .setSystemUiVisibility(
            isNightMode()
                ? 0
                : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
  }

  private boolean isNightMode() {
    return (getResources().getConfiguration().uiMode
            & android.content.res.Configuration.UI_MODE_NIGHT_MASK)
        == android.content.res.Configuration.UI_MODE_NIGHT_YES;
  }

  @Override
  public void onConfigurationChanged(android.content.res.Configuration configuration) {
    getTheme().applyStyle(R.style.Theme_AuroraPrimeOffice, true);
    super.onConfigurationChanged(configuration);
    configureSystemBars();
    if (webView != null) {
      webView.setBackgroundColor(getColor(R.color.aurora_surface));
      webView.getSettings().setTextZoom(Math.round(configuration.fontScale * 100));
    }
    if (presentationImmersive) applyPresentationImmersive(true);
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus && presentationImmersive) applyPresentationImmersive(true);
  }

  @SuppressWarnings("deprecation")
  private void applyPresentationImmersive(boolean enabled) {
    presentationImmersive = enabled;
    Window window = getWindow();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      WindowManager.LayoutParams attributes = window.getAttributes();
      attributes.layoutInDisplayCutoutMode =
          enabled
              ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
              : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT;
      window.setAttributes(attributes);
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      window.setDecorFitsSystemWindows(false);
      WindowInsetsController controller = window.getInsetsController();
      if (controller != null) {
        int systemBars = WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars();
        if (enabled) {
          controller.setSystemBarsBehavior(
              WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
          controller.hide(systemBars);
        } else {
          controller.show(systemBars);
        }
      }
    } else if (enabled) {
      window
          .getDecorView()
          .setSystemUiVisibility(
              View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                  | View.SYSTEM_UI_FLAG_FULLSCREEN
                  | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                  | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                  | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                  | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }
    if (!enabled) configureSystemBars();
    window.getDecorView().requestApplyInsets();
  }

  @SuppressLint("SetJavaScriptEnabled")
  @SuppressWarnings("deprecation")
  private void configureWebView(WebView view) {
    WebSettings settings = view.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setDatabaseEnabled(true);
    settings.setAllowFileAccess(true);
    settings.setAllowContentAccess(true);
    // Required, not optional: the payload is code-split ES modules under
    // file:///android_asset/web/, and Chromium treats a file:// page as origin
    // "null", so without this setting the entry module and every lazy chunk are
    // rejected by CORS and the app never renders. Verified against Chromium 152.
    settings.setAllowFileAccessFromFileURLs(true);
    settings.setMediaPlaybackRequiresUserGesture(false);
    settings.setBuiltInZoomControls(false);
    settings.setDisplayZoomControls(false);
    settings.setTextZoom(Math.round(getResources().getConfiguration().fontScale * 100));
    settings.setUserAgentString(settings.getUserAgentString() + " AuroraPrimeOfficeAndroid/0.1");

    view.addJavascriptInterface(documentBridge, "auroraHarmonyHost");
    try {
      cubeOfficeServices = new CubeOfficeServices(this);
      view.addJavascriptInterface(cubeOfficeServices, "cubeofficeServices");
    } catch (IllegalStateException unavailable) {
      // A full or unavailable private store must not prevent local document editing.
      cubeOfficeServices = null;
    }
    view.setWebViewClient(new LocalContentWebViewClient());
    view.setWebChromeClient(new OfficeWebChromeClient());
  }

  @Override
  protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    if (requestCode == REQUEST_OPEN_DOCUMENT) {
      ValueCallback<Uri[]> callback = pendingFileSelection;
      pendingFileSelection = null;
      if (callback == null) return;
      ArrayList<Uri> selectedUris = new ArrayList<>();
      if (resultCode == RESULT_OK && data != null) {
        ClipData clipData = data.getClipData();
        if (clipData != null) {
          for (int index = 0; index < clipData.getItemCount(); index++) {
            Uri uri = clipData.getItemAt(index).getUri();
            if (uri != null) selectedUris.add(uri);
          }
        } else if (data.getData() != null) {
          selectedUris.add(data.getData());
        }
      }
      for (Uri uri : selectedUris) {
        try {
          getContentResolver()
              .takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException ignored) {
          // Some document providers grant access only for the current activity.
        }
      }
      callback.onReceiveValue(selectedUris.isEmpty() ? null : selectedUris.toArray(new Uri[0]));
      return;
    }
    if (requestCode == REQUEST_SAVE_DOCUMENT) {
      Uri destination = resultCode == RESULT_OK && data != null ? data.getData() : null;
      documentBridge.completeSave(destination);
      return;
    }
    if (requestCode == REQUEST_ASSISTANT_OPEN_DOCUMENT) {
      if (resultCode == RESULT_OK && data != null && documentBridge.receivePickerResult(data)) {
        notifyWebOfPendingIntent();
      }
    }
  }

  private void launchAssistantDocumentPicker() {
    Intent intent =
        new Intent(Intent.ACTION_OPEN_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("*/*")
            .putExtra(Intent.EXTRA_MIME_TYPES, OFFICE_MIME_TYPES)
            .addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION
                    | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
    try {
      startActivityForResult(intent, REQUEST_ASSISTANT_OPEN_DOCUMENT);
    } catch (ActivityNotFoundException cause) {
      Toast.makeText(this, "设备没有可用的文件选择器", Toast.LENGTH_LONG).show();
    }
  }

  @Override
  @Deprecated
  public void onBackPressed() {
    if (webView == null || backDispatchPending) return;
    backDispatchPending = true;
    webView.evaluateJavascript(
        "Boolean(window.auroraHandleBack && window.auroraHandleBack())",
        handled -> {
          backDispatchPending = false;
          if ("true".equals(handled)) return;
          if (webView != null && webView.canGoBack()) webView.goBack();
          else MainActivity.super.onBackPressed();
        });
  }

  @Override
  protected void onDestroy() {
    if (Build.VERSION.SDK_INT >= 33 && backCallback != null) {
      getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
    }
    if (pendingFileSelection != null) pendingFileSelection.onReceiveValue(null);
    pendingFileSelection = null;
    if (startupSplash != null) startupSplash.removeCallbacks(startupSplashTimeout);
    if (documentBridge != null) documentBridge.dispose();
    if (webView != null) {
      webView.removeJavascriptInterface("auroraHarmonyHost");
      webView.removeJavascriptInterface("cubeofficeServices");
      if (cubeOfficeServices != null) cubeOfficeServices.close();
      webView.destroy();
    }
    super.onDestroy();
  }

  private final class OfficeWebChromeClient extends WebChromeClient {
    @Override
    public boolean onShowFileChooser(
        WebView source, ValueCallback<Uri[]> callback, FileChooserParams params) {
      if (pendingFileSelection != null) pendingFileSelection.onReceiveValue(null);
      pendingFileSelection = callback;
      String[] acceptedMimeTypes = acceptedMimeTypes(params);
      Intent intent =
          new Intent(Intent.ACTION_OPEN_DOCUMENT)
              .addCategory(Intent.CATEGORY_OPENABLE)
              .setType(acceptedMimeTypes.length == 1 ? acceptedMimeTypes[0] : "*/*")
              .addFlags(
                  Intent.FLAG_GRANT_READ_URI_PERMISSION
                      | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
      if (acceptedMimeTypes.length > 1) {
        intent.putExtra(Intent.EXTRA_MIME_TYPES, acceptedMimeTypes);
      }
      intent.putExtra(
          Intent.EXTRA_ALLOW_MULTIPLE,
          params != null && params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
      try {
        startActivityForResult(intent, REQUEST_OPEN_DOCUMENT);
        return true;
      } catch (ActivityNotFoundException cause) {
        pendingFileSelection = null;
        callback.onReceiveValue(null);
        Toast.makeText(MainActivity.this, "设备没有可用的文件选择器", Toast.LENGTH_LONG).show();
        return false;
      }
    }

    private String[] acceptedMimeTypes(FileChooserParams params) {
      LinkedHashSet<String> mimeTypes = new LinkedHashSet<>();
      if (params != null) {
        for (String group : params.getAcceptTypes()) {
          if (group == null) continue;
          for (String candidate : group.split(",")) {
            String value = candidate.trim().toLowerCase(Locale.ROOT);
            if (value.contains("/")) mimeTypes.add(value);
          }
        }
      }
      if (mimeTypes.isEmpty()) {
        for (String mimeType : OFFICE_MIME_TYPES) mimeTypes.add(mimeType);
      }
      return mimeTypes.toArray(new String[0]);
    }
  }

  private final class LocalContentWebViewClient extends WebViewClient {
    @Override
    public void onPageFinished(WebView view, String url) {
      super.onPageFinished(view, url);
      // Module scripts hold back the load event until they have run, so this
      // fires after the entry chunk executed even if appReady() never arrives.
      hideStartupSplash();
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
      super.onReceivedError(view, request, error);
      // Let the WebView's own error page through instead of hiding it behind the splash.
      if (request.isForMainFrame()) hideStartupSplash();
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
      Uri uri = request.getUrl();
      if ("file".equals(uri.getScheme()) && uri.toString().startsWith("file:///android_asset/")) {
        return false;
      }
      try {
        startActivity(new Intent(Intent.ACTION_VIEW, uri));
      } catch (ActivityNotFoundException ignored) {
        Toast.makeText(MainActivity.this, "无法打开这个链接", Toast.LENGTH_SHORT).show();
      }
      return true;
    }
  }

  public final class AuroraDocumentBridge {
    private final Map<String, SaveSession> sessions = new ConcurrentHashMap<>();
    private SaveSession pendingSave;
    private final Deque<PendingOpenDocument> pendingOpenDocuments = new ArrayDeque<>();
    private final Deque<String> pendingAssistantCommands = new ArrayDeque<>();
    private boolean pendingOpenDocumentAdvertised;

    @JavascriptInterface
    public boolean appReady() {
      runOnUiThread(MainActivity.this::hideStartupSplash);
      return true;
    }

    @JavascriptInterface
    public String getPlatform() {
      return "android";
    }

    @JavascriptInterface
    public boolean keepSoftKeyboard() {
      WebView activeWebView = webView;
      if (activeWebView == null) return false;
      activeWebView.post(
          () -> {
            if (webView == null || webView != activeWebView || isFinishing()) return;
            activeWebView.requestFocus(View.FOCUS_DOWN);
            InputMethodManager inputMethodManager =
                (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            if (!inputMethodManager.isActive(activeWebView)) {
              inputMethodManager.restartInput(activeWebView);
            }
            inputMethodManager.showSoftInput(activeWebView, InputMethodManager.SHOW_IMPLICIT);
          });
      return true;
    }

    @JavascriptInterface
    public boolean setPresentationLandscape(boolean enabled) {
      runOnUiThread(
          () -> {
            applyPresentationImmersive(enabled);
            setRequestedOrientation(
                enabled
                    ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                    : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
          });
      return true;
    }

    @JavascriptInterface
    public synchronized String consumePendingIntent() {
      PendingOpenDocument pending = pendingOpenDocuments.peekFirst();
      if (pending != null && !pendingOpenDocumentAdvertised) {
        pendingOpenDocumentAdvertised = true;
        try {
          JSONObject descriptor = new JSONObject();
          descriptor.put("type", "open-document");
          descriptor.put("id", pending.id);
          descriptor.put("fileName", pending.fileName);
          descriptor.put("mimeType", pending.mimeType);
          descriptor.put("size", pending.temporaryFile.length());
          return descriptor.toString();
        } catch (JSONException cause) {
          pendingOpenDocumentAdvertised = false;
          return "";
        }
      }
      return pendingAssistantCommands.isEmpty() ? "" : pendingAssistantCommands.removeFirst();
    }

    @JavascriptInterface
    public synchronized String readOpenDocumentChunk(String id, long offset, int length) {
      PendingOpenDocument pending = pendingOpenDocuments.peekFirst();
      if (pending == null || !pending.id.equals(id) || offset < 0 || length <= 0) return "";
      int safeLength = Math.min(length, 256 * 1024);
      byte[] buffer = new byte[safeLength];
      try (RandomAccessFile input = new RandomAccessFile(pending.temporaryFile, "r")) {
        input.seek(offset);
        int read = input.read(buffer);
        if (read <= 0) return "";
        return Base64.encodeToString(buffer, 0, read, Base64.NO_WRAP);
      } catch (IOException cause) {
        return "";
      }
    }

    @JavascriptInterface
    public synchronized boolean finishOpenDocument(String id) {
      PendingOpenDocument pending = pendingOpenDocuments.peekFirst();
      if (pending == null || !pending.id.equals(id)) return false;
      pendingOpenDocuments.removeFirst();
      pendingOpenDocumentAdvertised = false;
      deleteQuietly(pending.temporaryFile);
      return true;
    }

    @JavascriptInterface
    public boolean startWindowMove() {
      return false;
    }

    @JavascriptInterface
    public boolean toggleMaximizeWindow() {
      return false;
    }

    @JavascriptInterface
    public synchronized String beginSave(String requestedFileName) {
      String sessionId = UUID.randomUUID().toString();
      String fileName = safeFileName(requestedFileName);
      try {
        File temporaryFile = new File(getCacheDir(), "auroraprime-export-" + sessionId);
        SaveSession session =
            new SaveSession(
                sessionId, fileName, temporaryFile, new FileOutputStream(temporaryFile, false));
        sessions.put(sessionId, session);
        return sessionId;
      } catch (IOException cause) {
        throw new IllegalStateException("Could not create a temporary document.", cause);
      }
    }

    @JavascriptInterface
    public synchronized boolean appendSaveChunk(String sessionId, String encodedChunk) {
      SaveSession session = sessions.get(sessionId);
      if (session == null) return false;
      try {
        session.output.write(Base64.decode(encodedChunk, Base64.DEFAULT));
        return true;
      } catch (IOException | IllegalArgumentException cause) {
        return false;
      }
    }

    @JavascriptInterface
    public synchronized String finishSave(String sessionId) {
      SaveSession session = sessions.remove(sessionId);
      if (session == null) throw new IllegalArgumentException("Unknown Android save session.");
      closeQuietly(session.output);
      runOnUiThread(() -> launchSavePicker(session));
      return sessionId;
    }

    @JavascriptInterface
    public synchronized boolean abortSave(String sessionId) {
      SaveSession session = sessions.remove(sessionId);
      if (session == null) return false;
      closeQuietly(session.output);
      deleteQuietly(session.temporaryFile);
      return true;
    }

    private synchronized void launchSavePicker(SaveSession session) {
      if (pendingSave != null) {
        deleteQuietly(pendingSave.temporaryFile);
      }
      pendingSave = session;
      Intent intent =
          new Intent(Intent.ACTION_CREATE_DOCUMENT)
              .addCategory(Intent.CATEGORY_OPENABLE)
              .setType(mimeTypeFor(session.fileName))
              .putExtra(Intent.EXTRA_TITLE, session.fileName)
              .addFlags(
                  Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
      try {
        startActivityForResult(intent, REQUEST_SAVE_DOCUMENT);
      } catch (ActivityNotFoundException cause) {
        completeSave(null);
        Toast.makeText(MainActivity.this, "设备没有可用的保存位置选择器", Toast.LENGTH_LONG).show();
      }
    }

    private synchronized void completeSave(Uri destination) {
      SaveSession session = pendingSave;
      pendingSave = null;
      if (session == null) return;
      if (destination == null) {
        deleteQuietly(session.temporaryFile);
        return;
      }
      try (OutputStream output = getContentResolver().openOutputStream(destination, "wt")) {
        if (output == null) throw new IOException("The selected destination cannot be written.");
        java.nio.file.Files.copy(session.temporaryFile.toPath(), output);
        Toast.makeText(MainActivity.this, R.string.save_complete, Toast.LENGTH_SHORT).show();
      } catch (IOException cause) {
        Toast.makeText(MainActivity.this, R.string.save_failed, Toast.LENGTH_LONG).show();
      } finally {
        deleteQuietly(session.temporaryFile);
      }
    }

    private synchronized void dispose() {
      for (SaveSession session : sessions.values()) {
        closeQuietly(session.output);
        deleteQuietly(session.temporaryFile);
      }
      sessions.clear();
      if (pendingSave != null) deleteQuietly(pendingSave.temporaryFile);
      pendingSave = null;
      for (PendingOpenDocument pending : pendingOpenDocuments) {
        deleteQuietly(pending.temporaryFile);
      }
      pendingOpenDocuments.clear();
      pendingAssistantCommands.clear();
      pendingOpenDocumentAdvertised = false;
    }

    private synchronized boolean receiveIntent(Intent intent) {
      AssistantCommand assistantCommand =
          AssistantCommand.fromIntent(intent, getPackageName(), getString(R.string.app_url_scheme));
      if (assistantCommand != null) {
        if ("open-document-picker".equals(assistantCommand.command)) {
          runOnUiThread(MainActivity.this::launchAssistantDocumentPicker);
        } else {
          pendingAssistantCommands.addLast(assistantCommand.toJson());
        }
        return true;
      }
      List<Uri> uris = documentUris(intent);
      if (uris.isEmpty()) return false;
      boolean received = false;
      for (Uri uri : uris) {
        if (receiveDocument(uri, intent.getType())) received = true;
      }
      return received;
    }

    private synchronized boolean receivePickerResult(Intent result) {
      boolean received = false;
      for (Uri uri : pickerResultUris(result)) {
        try {
          getContentResolver()
              .takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException ignored) {
          // Some document providers grant access only for the current activity.
        }
        if (receiveDocument(uri, result.getType())) received = true;
      }
      return received;
    }

    private boolean receiveDocument(Uri uri, String intentMimeType) {
      String id = UUID.randomUUID().toString();
      File temporaryFile = new File(getCacheDir(), "auroraprime-open-" + id);
      try (InputStream input = getContentResolver().openInputStream(uri);
          FileOutputStream output = new FileOutputStream(temporaryFile, false)) {
        if (input == null) throw new IOException("The selected document cannot be read.");
        byte[] buffer = new byte[64 * 1024];
        int read;
        while ((read = input.read(buffer)) >= 0) {
          if (read > 0) output.write(buffer, 0, read);
        }
        String mimeType = getContentResolver().getType(uri);
        if (mimeType == null || "*/*".equals(mimeType)) mimeType = intentMimeType;
        String fileName = displayName(uri);
        if (fileName == null || fileName.trim().isEmpty()) {
          fileName = "Document" + extensionForMimeType(mimeType);
        }
        pendingOpenDocuments.addLast(
            new PendingOpenDocument(
                id,
                safeFileName(fileName),
                mimeType == null ? "application/octet-stream" : mimeType,
                temporaryFile));
        return true;
      } catch (IOException | SecurityException cause) {
        deleteQuietly(temporaryFile);
        Toast.makeText(MainActivity.this, "无法读取这个文档", Toast.LENGTH_LONG).show();
        return false;
      }
    }
  }

  private static final class AssistantCommand {
    final String command;
    final String format;
    final String mode;

    AssistantCommand(String command, String format, String mode) {
      this.command = command;
      this.format = format;
      this.mode = mode;
    }

    static AssistantCommand fromIntent(Intent intent, String packageName, String urlScheme) {
      if (intent == null) return null;
      Uri uri = intent.getData();
      boolean deepLink =
          Intent.ACTION_VIEW.equals(intent.getAction())
              && uri != null
              && urlScheme.equalsIgnoreCase(uri.getScheme())
              && "assistant".equalsIgnoreCase(uri.getHost());
      String assistantAction = packageName + ACTION_ASSISTANT_SUFFIX;
      if (!assistantAction.equals(intent.getAction()) && !deepLink) return null;

      String command =
          assistantAction.equals(intent.getAction())
              ? intent.getStringExtra("command")
              : firstPathSegment(uri);
      String format =
          assistantAction.equals(intent.getAction())
              ? intent.getStringExtra("format")
              : uri.getQueryParameter("format");
      String mode =
          assistantAction.equals(intent.getAction())
              ? intent.getStringExtra("mode")
              : uri.getQueryParameter("mode");
      return normalize(command, format, mode);
    }

    private static AssistantCommand normalize(String command, String format, String mode) {
      String normalizedCommand = lower(command);
      String normalizedFormat = normalizeFormat(format);
      String normalizedMode = lower(mode);

      if (normalizedCommand.startsWith("new-")) {
        normalizedFormat = normalizeFormat(normalizedCommand.substring(4));
        normalizedCommand = "new";
      }
      if ("open".equals(normalizedCommand)) {
        return new AssistantCommand("open-document-picker", null, null);
      }
      if ("new".equals(normalizedCommand) && normalizedFormat != null) {
        return new AssistantCommand("new-document", normalizedFormat, null);
      }
      if ("read".equals(normalizedCommand) || "reading".equals(normalizedCommand)) {
        normalizedCommand = "set-mode";
        normalizedMode = "reading";
      } else if ("edit".equals(normalizedCommand) || "editing".equals(normalizedCommand)) {
        normalizedCommand = "set-mode";
        normalizedMode = "editing";
      } else if ("mode".equals(normalizedCommand)) {
        normalizedCommand = "set-mode";
      }
      if ("set-mode".equals(normalizedCommand)) {
        if (!"reading".equals(normalizedMode) && !"editing".equals(normalizedMode)) return null;
        return new AssistantCommand(normalizedCommand, null, normalizedMode);
      }
      if ("home".equals(normalizedCommand)
          || "activity".equals(normalizedCommand)
          || "recent".equals(normalizedCommand)
          || "open-recent".equals(normalizedCommand)) {
        return new AssistantCommand(normalizedCommand, null, null);
      }
      return null;
    }

    String toJson() {
      try {
        JSONObject descriptor = new JSONObject();
        descriptor.put("type", "assistant-command");
        descriptor.put("command", command);
        descriptor.put("source", "android");
        descriptor.put("requestId", UUID.randomUUID().toString());
        if (format != null) descriptor.put("format", format);
        if (mode != null) descriptor.put("mode", mode);
        return descriptor.toString();
      } catch (JSONException impossible) {
        return "";
      }
    }

    private static String firstPathSegment(Uri uri) {
      if (uri == null || uri.getPathSegments().isEmpty()) return "home";
      return uri.getPathSegments().get(0);
    }

    private static String normalizeFormat(String format) {
      switch (lower(format)) {
        case "docx":
        case "word":
          return "docx";
        case "ppt":
        case "pptx":
        case "powerpoint":
          return "pptx";
        case "xls":
        case "xlsx":
        case "excel":
          return "xlsx";
        case "vsdx":
        case "visio":
          return "vsdx";
        case "md":
        case "markdown":
          return "markdown";
        default:
          return null;
      }
    }

    private static String lower(String value) {
      return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
  }

  private static final class PendingOpenDocument {
    final String id;
    final String fileName;
    final String mimeType;
    final File temporaryFile;

    PendingOpenDocument(String id, String fileName, String mimeType, File temporaryFile) {
      this.id = id;
      this.fileName = fileName;
      this.mimeType = mimeType;
      this.temporaryFile = temporaryFile;
    }
  }

  private static final class SaveSession {
    final String id;
    final String fileName;
    final File temporaryFile;
    final FileOutputStream output;

    SaveSession(String id, String fileName, File temporaryFile, FileOutputStream output) {
      this.id = id;
      this.fileName = fileName;
      this.temporaryFile = temporaryFile;
      this.output = output;
    }
  }

  private static String safeFileName(String fileName) {
    String trimmed = fileName == null ? "" : fileName.trim().replaceAll("[\\\\/:*?\"<>|]", "_");
    return trimmed.isEmpty() ? "Document.docx" : trimmed;
  }

  @SuppressWarnings("deprecation")
  private static List<Uri> documentUris(Intent intent) {
    LinkedHashSet<Uri> uris = new LinkedHashSet<>();
    if (intent == null) return new ArrayList<>();
    if (Intent.ACTION_VIEW.equals(intent.getAction())) {
      if (intent.getData() != null) uris.add(intent.getData());
    } else if (Intent.ACTION_SEND.equals(intent.getAction())) {
      Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
      if (stream != null) uris.add(stream);
    } else if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
      ArrayList<Uri> streams = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
      if (streams != null) uris.addAll(streams);
    }
    ClipData clipData = intent.getClipData();
    if (clipData != null) {
      for (int index = 0; index < clipData.getItemCount(); index++) {
        Uri uri = clipData.getItemAt(index).getUri();
        if (uri != null) uris.add(uri);
      }
    }
    return new ArrayList<>(uris);
  }

  private static List<Uri> pickerResultUris(Intent result) {
    LinkedHashSet<Uri> uris = new LinkedHashSet<>();
    if (result == null) return new ArrayList<>();
    if (result.getData() != null) uris.add(result.getData());
    ClipData clipData = result.getClipData();
    if (clipData != null) {
      for (int index = 0; index < clipData.getItemCount(); index++) {
        Uri uri = clipData.getItemAt(index).getUri();
        if (uri != null) uris.add(uri);
      }
    }
    return new ArrayList<>(uris);
  }

  private String displayName(Uri uri) {
    if ("content".equals(uri.getScheme())) {
      try (Cursor cursor =
          getContentResolver()
              .query(uri, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
        if (cursor != null && cursor.moveToFirst()) {
          int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
          if (index >= 0) return cursor.getString(index);
        }
      } catch (RuntimeException ignored) {
        // Fall back to the final URI segment below.
      }
    }
    return uri.getLastPathSegment();
  }

  private static String extensionForMimeType(String mimeType) {
    if (mimeType == null) return ".docx";
    if ("application/msword".equals(mimeType)) return ".doc";
    if ("application/vnd.ms-excel".equals(mimeType)) return ".xls";
    if ("application/vnd.ms-powerpoint".equals(mimeType)) return ".ppt";
    if ("text/csv".equals(mimeType)) return ".csv";
    if ("image/png".equals(mimeType)) return ".png";
    if ("image/jpeg".equals(mimeType)) return ".jpg";
    if ("image/webp".equals(mimeType)) return ".webp";
    if (mimeType.contains("emf")) return ".emf";
    if (mimeType.contains("wmf") || mimeType.contains("msmetafile")) return ".wmf";
    if (mimeType.contains("presentationml")) return ".pptx";
    if (mimeType.contains("spreadsheetml")) return ".xlsx";
    if (mimeType.contains("visio")) return ".vsdx";
    if (mimeType.contains("jmp")) return ".jmp";
    if (mimeType.contains("jgraph") || mimeType.contains("drawio")) return ".drawio";
    if ("application/pdf".equals(mimeType)) return ".pdf";
    if (mimeType.contains("markdown") || "text/plain".equals(mimeType)) return ".md";
    return ".docx";
  }

  private static String mimeTypeFor(String fileName) {
    String normalized = fileName.toLowerCase(Locale.ROOT);
    if (normalized.endsWith(".pptx")) {
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    }
    if (normalized.endsWith(".xlsx")) {
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }
    if (normalized.endsWith(".vsdx")) return "application/vnd.ms-visio.drawing";
    if (normalized.endsWith(".jmp")) return "application/x-jmp-data-table";
    if (normalized.endsWith(".drawio")) return "application/vnd.jgraph.mxfile";
    if (normalized.endsWith(".pdf")) return "application/pdf";
    if (normalized.endsWith(".md") || normalized.endsWith(".markdown")) return "text/markdown";
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  private static void closeQuietly(OutputStream output) {
    try {
      output.close();
    } catch (IOException ignored) {
      // The temporary file is removed even if its stream was already closed.
    }
  }

  private static void deleteQuietly(File file) {
    if (file != null && file.exists()) file.delete();
  }
}
