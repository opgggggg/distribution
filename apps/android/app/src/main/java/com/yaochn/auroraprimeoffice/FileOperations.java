package com.yaochn.auroraprimeoffice;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.provider.DocumentsContract;
import java.io.*;
import java.security.MessageDigest;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.*;
import org.json.JSONObject;

/** Owns final receipts, provider references and serialized writes outside the WebView. */
final class FileOperations {
  static final int REQUEST_EXPORT = 4102;
  private final Activity activity;
  private final SharedPreferences references;
  private final ExecutorService io = Executors.newSingleThreadExecutor();
  private final Map<String, String> results = new ConcurrentHashMap<>();
  private Export pending;

  private record Export(String id, String name, File file) {}

  FileOperations(Activity activity) {
    this.activity = activity;
    references = activity.getSharedPreferences("document-sources", 0);
  }

  JSONObject source(Uri uri, String name, File staged) throws Exception {
    String id =
        UUID.nameUUIDFromBytes(uri.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8))
            .toString();
    boolean writable = false;
    try (Cursor cursor =
        activity
            .getContentResolver()
            .query(uri, new String[] {DocumentsContract.Document.COLUMN_FLAGS}, null, null, null)) {
      writable =
          cursor != null
              && cursor.moveToFirst()
              && (cursor.getLong(0) & DocumentsContract.Document.FLAG_SUPPORTS_WRITE) != 0
              && activity.checkUriPermission(
                      uri,
                      android.os.Process.myPid(),
                      android.os.Process.myUid(),
                      Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                  == android.content.pm.PackageManager.PERMISSION_GRANTED;
    } catch (RuntimeException ignored) {
    }
    String version = digest(staged);
    String location = "Android 文件";
    android.content.pm.ProviderInfo provider =
        uri.getAuthority() == null
            ? null
            : activity.getPackageManager().resolveContentProvider(uri.getAuthority(), 0);
    if (provider != null) location = provider.loadLabel(activity.getPackageManager()).toString();
    references.edit().putString(id, uri.toString()).apply();
    return new JSONObject()
        .put("id", id)
        .put("name", name)
        .put("writable", writable)
        .put("version", version)
        .put("location", location);
  }

  void finish(String id, String name, File file, String intent, String encodedSource) {
    if ("save".equals(intent)) {
      io.execute(() -> writeOriginal(id, file, encodedSource));
    } else {
      activity.runOnUiThread(
          () -> {
            try {
              if ("export".equals(intent)) {
                if (pending != null) throw new IOException("另一个保存操作尚未完成。");
                pending = new Export(id, name, file);
                activity.startActivityForResult(
                    new Intent(Intent.ACTION_CREATE_DOCUMENT)
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .setType(OpenFormats.mimeTypeFor(name))
                        .putExtra(Intent.EXTRA_TITLE, name)
                        .addFlags(
                            Intent.FLAG_GRANT_READ_URI_PERMISSION
                                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION),
                    REQUEST_EXPORT);
              } else if ("share".equals(intent)) {
                File directory = new File(activity.getCacheDir(), "shared/" + UUID.randomUUID());
                if (!directory.mkdirs()) throw new IOException("无法准备分享文件。");
                File shared = new File(directory, name);
                java.nio.file.Files.move(file.toPath(), shared.toPath());
                Uri uri =
                    new Uri.Builder()
                        .scheme("content")
                        .authority(activity.getPackageName() + ".shared")
                        .appendPath(directory.getName())
                        .appendPath(name)
                        .build();
                Intent send =
                    new Intent(Intent.ACTION_SEND)
                        .setType(OpenFormats.mimeTypeFor(name))
                        .putExtra(Intent.EXTRA_STREAM, uri)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                send.setClipData(ClipData.newUri(activity.getContentResolver(), name, uri));
                activity.startActivity(Intent.createChooser(send, "分享文件"));
                result(
                    id,
                    "share-opened",
                    null,
                    null); // Receipt means the chooser opened, never that a recipient sent it.
              } else if ("print".equals(intent)) {
                if (!name.toLowerCase(java.util.Locale.ROOT).endsWith(".pdf"))
                  throw new IOException("请先转换为 PDF 再打印。");
                PrintManager manager =
                    (PrintManager) activity.getSystemService(Activity.PRINT_SERVICE);
                manager.print(name, new PdfPrintAdapter(name, file), null);
                result(id, "print-opened", null, null);
              } else throw new IOException("未知文件操作。");
            } catch (Exception cause) {
              if (pending != null && pending.id.equals(id)) pending = null;
              file.delete();
              error(id, cause);
            }
          });
    }
  }

  void shareMany(String id, java.util.List<File> files, java.util.List<String> names) {
    activity.runOnUiThread(
        () -> {
          try {
            java.util.ArrayList<Uri> uris = new java.util.ArrayList<>();
            for (int i = 0; i < files.size(); i++) {
              File directory = new File(activity.getCacheDir(), "shared/" + UUID.randomUUID());
              if (!directory.mkdirs()) throw new IOException("无法准备分享文件。");
              File shared = new File(directory, names.get(i));
              java.nio.file.Files.move(files.get(i).toPath(), shared.toPath());
              uris.add(
                  new Uri.Builder()
                      .scheme("content")
                      .authority(activity.getPackageName() + ".shared")
                      .appendPath(directory.getName())
                      .appendPath(names.get(i))
                      .build());
            }
            ClipData clip = ClipData.newUri(activity.getContentResolver(), "分享文件", uris.get(0));
            for (int i = 1; i < uris.size(); i++) clip.addItem(new ClipData.Item(uris.get(i)));
            Intent send =
                new Intent(Intent.ACTION_SEND_MULTIPLE)
                    .setType("*/*")
                    .putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            send.setClipData(clip);
            activity.startActivity(Intent.createChooser(send, "分享所选文件"));
            result(id, "share-opened", null, null);
          } catch (Exception cause) {
            for (File file : files) file.delete();
            error(id, cause);
          }
        });
  }

  void completeExport(Uri destination, int flags) {
    Export operation = pending;
    pending = null;
    if (operation == null) return;
    if (destination == null) {
      operation.file.delete();
      result(operation.id, "cancelled", null, null);
      return;
    }
    try {
      activity
          .getContentResolver()
          .takePersistableUriPermission(
              destination,
              flags
                  & (Intent.FLAG_GRANT_READ_URI_PERMISSION
                      | Intent.FLAG_GRANT_WRITE_URI_PERMISSION));
    } catch (SecurityException ignored) {
    }
    io.execute(
        () -> {
          try {
            copyTo(operation.file, destination);
            result(
                operation.id,
                "saved",
                destination.toString(),
                source(destination, operation.name, operation.file));
          } catch (Exception cause) {
            error(operation.id, cause);
          } finally {
            operation.file.delete();
          }
        });
  }

  private void writeOriginal(String id, File file, String encodedSource) {
    File backup = null;
    try {
      JSONObject source = new JSONObject(encodedSource);
      String reference = references.getString(source.getString("id"), null);
      if (reference == null || !source.optBoolean("writable"))
        throw new IOException("原文件不可写，请另存副本。");
      Uri uri = Uri.parse(reference);
      backup = File.createTempFile("original-backup-", ".bin", activity.getCacheDir());
      try (InputStream input = activity.getContentResolver().openInputStream(uri)) {
        if (input == null) throw new IOException("无法读取原文件。");
        java.nio.file.Files.copy(
            input, backup.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
      }
      if (!digest(backup).equals(source.optString("version")))
        throw new IOException("原文件已被其他应用修改，请重新打开或另存副本。");
      try {
        copyTo(file, uri);
      } catch (Exception failure) {
        try {
          copyTo(backup, uri);
        } catch (Exception restoration) {
          throw new IOException("写入失败，原文件恢复也失败；请立即另存本机草稿。", restoration);
        }
        throw failure;
      }
      result(id, "saved", uri.toString(), source(uri, source.getString("name"), file));
    } catch (Exception cause) {
      error(id, cause);
    } finally {
      file.delete();
      if (backup != null) backup.delete();
    }
  }

  private void copyTo(File file, Uri destination) throws IOException {
    try (OutputStream output = activity.getContentResolver().openOutputStream(destination, "wt")) {
      if (output == null) throw new IOException("保存位置不可写。");
      java.nio.file.Files.copy(file.toPath(), output);
      output.flush();
    }
  }

  private static String digest(File file) throws Exception {
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    try (InputStream input = new FileInputStream(file)) {
      byte[] buffer = new byte[64 * 1024];
      int count;
      while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
    }
    StringBuilder hex = new StringBuilder();
    for (byte value : digest.digest()) hex.append(String.format("%02x", value & 255));
    return hex.toString();
  }

  private void result(String id, String status, String destination, JSONObject source) {
    try {
      results.put(
          id,
          new JSONObject()
              .put("status", status)
              .put("destination", destination)
              .put("source", source)
              .toString());
    } catch (Exception ignored) {
    }
  }

  private void error(String id, Exception cause) {
    try {
      results.put(
          id,
          new JSONObject()
              .put("error", cause.getMessage() == null ? "文件操作失败，请重试。" : cause.getMessage())
              .toString());
    } catch (Exception ignored) {
    }
  }

  String take(String id) {
    String result = results.remove(id);
    return result == null ? "" : result;
  }

  void dispose() {
    if (pending != null) {
      pending.file.delete();
      pending = null;
    }
    io.shutdown();
  }

  private static final class PdfPrintAdapter extends PrintDocumentAdapter {
    final String name;
    final File file;
    PrintAttributes attributes;

    PdfPrintAdapter(String name, File file) {
      this.name = name;
      this.file = file;
    }

    @Override
    public void onLayout(
        PrintAttributes old,
        PrintAttributes next,
        CancellationSignal signal,
        LayoutResultCallback callback,
        android.os.Bundle extras) {
      attributes = next;
      if (signal.isCanceled()) {
        callback.onLayoutCancelled();
        return;
      }
      try (ParcelFileDescriptor descriptor =
              ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
          android.graphics.pdf.PdfRenderer renderer =
              new android.graphics.pdf.PdfRenderer(descriptor)) {
        callback.onLayoutFinished(
            new PrintDocumentInfo.Builder(name)
                .setPageCount(renderer.getPageCount())
                .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                .build(),
            !next.equals(old));
      } catch (IOException cause) {
        callback.onLayoutFailed(cause.getMessage());
      }
    }

    @Override
    public void onWrite(
        PageRange[] ranges,
        ParcelFileDescriptor target,
        CancellationSignal signal,
        WriteResultCallback callback) {
      new Thread(
              () -> {
                android.graphics.pdf.PdfDocument output = new android.graphics.pdf.PdfDocument();
                try (ParcelFileDescriptor descriptor =
                        ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
                    android.graphics.pdf.PdfRenderer renderer =
                        new android.graphics.pdf.PdfRenderer(descriptor);
                    OutputStream stream = new FileOutputStream(target.getFileDescriptor())) {
                  for (int index = 0; index < renderer.getPageCount(); index++) {
                    boolean selected = false;
                    for (PageRange range : ranges)
                      if (index >= range.getStart() && index <= range.getEnd()) selected = true;
                    if (!selected) continue;
                    if (signal.isCanceled()) {
                      callback.onWriteCancelled();
                      return;
                    }
                    try (android.graphics.pdf.PdfRenderer.Page page = renderer.openPage(index)) {
                      double scale =
                          Math.min(
                              2.0,
                              Math.sqrt(
                                  4_000_000.0 / ((double) page.getWidth() * page.getHeight())));
                      int width = Math.max(1, (int) (page.getWidth() * scale)),
                          height = Math.max(1, (int) (page.getHeight() * scale));
                      android.graphics.Bitmap bitmap =
                          android.graphics.Bitmap.createBitmap(
                              width, height, android.graphics.Bitmap.Config.ARGB_8888);
                      try {
                        bitmap.eraseColor(android.graphics.Color.WHITE);
                        android.graphics.Matrix matrix = new android.graphics.Matrix();
                        matrix.setScale((float) scale, (float) scale);
                        page.render(
                            bitmap,
                            null,
                            matrix,
                            android.graphics.pdf.PdfRenderer.Page.RENDER_MODE_FOR_PRINT);
                        android.graphics.pdf.PdfDocument.Page printed =
                            output.startPage(
                                new android.graphics.pdf.PdfDocument.PageInfo.Builder(
                                        page.getWidth(), page.getHeight(), index + 1)
                                    .create());
                        printed
                            .getCanvas()
                            .drawBitmap(
                                bitmap,
                                null,
                                new android.graphics.Rect(0, 0, page.getWidth(), page.getHeight()),
                                null);
                        output.finishPage(printed);
                      } finally {
                        bitmap.recycle();
                      }
                    }
                  }
                  if (signal.isCanceled()) {
                    callback.onWriteCancelled();
                    return;
                  }
                  output.writeTo(stream);
                  callback.onWriteFinished(ranges);
                } catch (Exception cause) {
                  callback.onWriteFailed(cause.getMessage());
                } finally {
                  output.close();
                }
              },
              "pdf-print")
          .start();
    }

    @Override
    public void onFinish() {
      file.delete();
    }
  }
}
