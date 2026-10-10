package com.yaochn.auroraprimeoffice;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ImageDecoder;
import android.os.Build;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

/**
 * Re-encodes an image the WebView cannot decode (HEIC/HEIF) as JPEG with the platform decoder.
 * ImageDecoder reads HEIF from Android 9 and applies the stored orientation; older releases have no
 * HEIF decoder, so they report failure and the Web shell explains it.
 */
final class SystemImageDecoder {
  // Below the 16.7 MP canvas ceiling the Web shell re-encodes into.
  private static final long MAX_OUTPUT_PIXELS = 16_000_000L;
  private static final int JPEG_QUALITY = 92;

  private SystemImageDecoder() {}

  /** Writes {@code source} as JPEG to {@code destination}; false when it cannot be decoded. */
  static boolean decodeToJpeg(File source, File destination) {
    Bitmap bitmap = decode(source);
    if (bitmap == null) return false;
    try (OutputStream output = new FileOutputStream(destination, false)) {
      return bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, output);
    } catch (IOException cause) {
      return false;
    } finally {
      bitmap.recycle();
    }
  }

  private static Bitmap decode(File source) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      try {
        return ImageDecoder.decodeBitmap(
            ImageDecoder.createSource(source),
            (decoder, info, ignored) -> {
              // Hardware bitmaps cannot be compressed back to bytes.
              decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE);
              int width = info.getSize().getWidth();
              int height = info.getSize().getHeight();
              long pixels = (long) width * height;
              if (pixels > MAX_OUTPUT_PIXELS) {
                double scale = Math.sqrt((double) MAX_OUTPUT_PIXELS / pixels);
                decoder.setTargetSize(
                    Math.max(1, (int) (width * scale)), Math.max(1, (int) (height * scale)));
              }
            });
      } catch (IOException | RuntimeException cause) {
        return null;
      }
    }
    return BitmapFactory.decodeFile(source.getPath());
  }
}
