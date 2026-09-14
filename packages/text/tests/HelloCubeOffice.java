package com.cubexp.example;

import java.time.LocalDate;
import java.util.List;

/** CubeOffice 文本预览示例。 展示 Java 关键字、注释、字符串、数字与泛型的语法高亮。 */
public final class HelloCubeOffice {
  private static final String GREETING = "你好，CubeOffice！";

  public static void main(String[] args) {
    List<String> languages = List.of("Java", "TypeScript", "Python");

    System.out.println(GREETING);
    System.out.println("今天是：" + LocalDate.now());

    // 逐个输出支持的语言，保留原始缩进和换行。
    for (int index = 0; index < languages.size(); index++) {
      String message = String.format("%d. %s", index + 1, languages.get(index));
      System.out.println(message);
    }
  }
}
