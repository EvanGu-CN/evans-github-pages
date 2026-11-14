# 小工具集

使用原生 HTML、CSS 和 JavaScript 构建的静态工具集，适合部署到 GitHub Pages。

- [文本与开发工具](text-tools/)：文本对比、JSON 格式化与压缩、Base64／Base64URL／URL 编解码、MD5／SHA-256／SHA-512、逐行整理与统计、UUID v4、时间戳转换。
- [InterviewBuddy 面试题库](interview-buddy/)：36 个题库、2411 道题，支持分类浏览、搜索筛选与随机练习，答案解析内嵌图示，可离线使用。
- [图片压缩](image-compressor/)：在浏览器本地批量压缩 JPG、PNG、WebP，可调整画质和最长边，并查看压缩前后的体积和尺寸。
- [二维码生成](qr-generator/)：在浏览器中将网址或文本转为二维码，支持 PNG 和 SVG。
- [投骰子](dice-roller/)：选择 1–6 颗六面骰，一次投掷并汇总点数。
- [沭阳漫游](slop-shuyang/)：基于 Three.js 的沭阳三维城市，包含7,741条建筑来源、147个具名小区范围和21处可传送地标，支持步行、驾车、骑行、飞行、小地图与中文实景参考。需要支持WebGPU或WebGL2的现代浏览器，三维渲染依赖通过CDN加载；模型精度和数据日期见[项目说明](slop-shuyang/README.md)。
- [宠物连连看](lianliankan/)：两转弯内连线消除同图标。
- [超级玛丽](super-mario/)：沿用初代玩法的 8 个世界和 32 个原创关卡，支持选关、单人或双人轮流、键盘和触屏。
- [雷霆战机](thunder-fighter/)：自动射击，拾取道具可切换并升级散射炮、穿透炮和追踪弹；十大战区各有多阶段首领战，支持六秒护盾、EMP、关间改造与多轮远征。支持键盘和触屏，最高分保存在本机。
- [Flappy Bird](flappy-bird/)：点击、触屏或按空格振翅，穿过水管得分，支持暂停、重开和本机最高分。
- [俄罗斯方块](tetris/)：七种方块、落点预览、下块预览、消行计分和逐级加速。
- [贪吃蛇](snake/)：吃果实成长、连续转弯与逐步加速，支持键盘和屏幕方向键。
- [3D Pinball: Space Cadet 网页致敬版](space-cadet/)：太空弹珠台，双挡板、蓄力发射、任务靶与倍率奖励，每局三球。

文本处理和二维码生成在浏览器本地完成，脚本和依赖随站点发布。新增工具时，新建目录并在首页添加入口。所有资源使用相对路径，兼容 GitHub Pages 项目路径。

## 第三方依赖

- 文本对比使用 [JsDiff 9.0.0](https://github.com/kpdecker/jsdiff)，[BSD-3-Clause](text-tools/vendor/diff-LICENSE.txt)。
- MD5 使用 [blueimp-md5 2.19.0](https://github.com/blueimp/JavaScript-MD5)，[MIT](text-tools/vendor/md5-LICENSE.txt)。
- 二维码使用 [qrcode-generator 2.0.4](https://github.com/kazuhikoarase/qrcode-generator)，[MIT](qr-generator/vendor/qrcode-LICENSE.txt)。
- 沭阳漫游基于 [Slop New York](https://github.com/mrdoob/slop-newyork/)，保留[MIT许可](slop-shuyang/LICENSE)。建筑与地图数据署名和许可见[数据说明](slop-shuyang/tools/data/shuyang/BUILDINGS.md)。
