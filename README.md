# 小工具集

使用原生 HTML、CSS 和 JavaScript 构建的静态工具集，适合部署到 GitHub Pages。

- [文本与开发工具](text-tools/)：文本对比、JSON 格式化与压缩、Base64／Base64URL／URL 编解码、MD5／SHA-256／SHA-512、逐行整理与统计、UUID v4、时间戳转换。
- [InterviewBuddy 面试题库](interview-buddy/)：36 个题库、2411 道题，支持分类浏览、搜索筛选与随机练习，答案解析内嵌图示，可离线使用。
- [图片压缩](image-compressor/)：在浏览器本地批量压缩 JPG、PNG、WebP，可调整画质和最长边，并查看压缩前后的体积和尺寸。
- [二维码生成](qr-generator/)：在浏览器中将网址或文本转为二维码，支持 PNG 和 SVG。
- [投骰子](dice-roller/)：选择 1–6 颗六面骰，一次投掷并汇总点数。
- [宠物连连看](lianliankan/)：两转弯内连线消除同图标。

文本处理和二维码生成在浏览器本地完成，脚本和依赖随站点发布。新增工具时，新建目录并在首页添加入口。所有资源使用相对路径，兼容 GitHub Pages 项目路径。

## 第三方依赖

- 文本对比使用 [JsDiff 9.0.0](https://github.com/kpdecker/jsdiff)，[BSD-3-Clause](text-tools/vendor/diff-LICENSE.txt)。
- MD5 使用 [blueimp-md5 2.19.0](https://github.com/blueimp/JavaScript-MD5)，[MIT](text-tools/vendor/md5-LICENSE.txt)。
- 二维码使用 [qrcode-generator 2.0.4](https://github.com/kazuhikoarase/qrcode-generator)，[MIT](qr-generator/vendor/qrcode-LICENSE.txt)。
