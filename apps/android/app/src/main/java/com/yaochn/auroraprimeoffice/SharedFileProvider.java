package com.yaochn.auroraprimeoffice;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

/** Read-only, per-URI grants. No filesystem paths or write grants leave the app. */
public final class SharedFileProvider extends ContentProvider {
  @Override
  public boolean onCreate() {
    File root = new File(getContext().getCacheDir(), "shared");
    File[] directories = root.listFiles();
    if (directories != null)
      for (File directory : directories) {
        if (System.currentTimeMillis() - directory.lastModified() > 24 * 60 * 60 * 1000L) {
          File[] files = directory.listFiles();
          if (files != null) for (File file : files) file.delete();
          directory.delete();
        }
      }
    return true;
  }

  private File file(Uri uri) throws FileNotFoundException {
    try {
      if (uri.getPathSegments().size() != 2) throw new IllegalArgumentException();
      File root = new File(getContext().getCacheDir(), "shared").getCanonicalFile();
      File file =
          new File(new File(root, uri.getPathSegments().get(0)), uri.getPathSegments().get(1))
              .getCanonicalFile();
      if (!file.getPath().startsWith(root.getPath() + File.separator) || !file.isFile())
        throw new IllegalArgumentException();
      return file;
    } catch (Exception cause) {
      throw new FileNotFoundException("分享文件不存在或已过期。");
    }
  }

  @Override
  public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
    if (!"r".equals(mode)) throw new FileNotFoundException("分享文件只允许读取。");
    return ParcelFileDescriptor.open(file(uri), ParcelFileDescriptor.MODE_READ_ONLY);
  }

  @Override
  public String getType(Uri uri) {
    return OpenFormats.mimeTypeFor(uri.getLastPathSegment());
  }

  @Override
  public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
    try {
      File file = file(uri);
      String[] columns =
          projection == null
              ? new String[] {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}
              : projection;
      MatrixCursor cursor = new MatrixCursor(columns);
      Object[] row = new Object[columns.length];
      for (int i = 0; i < columns.length; i++)
        row[i] =
            OpenableColumns.DISPLAY_NAME.equals(columns[i])
                ? file.getName()
                : OpenableColumns.SIZE.equals(columns[i]) ? file.length() : null;
      cursor.addRow(row);
      return cursor;
    } catch (FileNotFoundException ignored) {
      return null;
    }
  }

  @Override
  public Uri insert(Uri uri, ContentValues values) {
    throw new UnsupportedOperationException();
  }

  @Override
  public int update(Uri uri, ContentValues values, String selection, String[] args) {
    throw new UnsupportedOperationException();
  }

  @Override
  public int delete(Uri uri, String selection, String[] args) {
    throw new UnsupportedOperationException();
  }
}
