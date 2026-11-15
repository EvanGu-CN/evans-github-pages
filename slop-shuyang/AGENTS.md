# AGENTS.md

本文件适用于整个 `slop-shuyang` 仓库。先阅读 `README.md`，再查看本次相关模块、`docs/BUILDING_REFINEMENT_PROGRESS.md` 与最近验收记录。

## 项目与仓库

- 这是沭阳城区的静态Three.js WebGPU/TSL项目，没有前端构建步骤，也没有需启动的应用后端。运行：`python -m http.server 8123`。
- 源码远程 `origin`：`https://github.com/EvanGu-CN/slop-shuyang.git`；原项目保留为 `upstream`：`https://github.com/mrdoob/slop-newyork.git`。不得将沭阳提交推送到upstream。
- 新开发分支使用 `codex/` 前缀。当前工作分支可能与远程main不同；推送前检查实际分支、远程URL及目标引用，不使用强推覆盖既有历史。
- Pages部署位于另一个仓库 `EvanGu-CN/evans-github-pages` 的 `slop-shuyang/` 子目录。源码仓库与发布仓库要区分；修改不能覆盖其他游戏或无关文件。

## 数据和实景要求

- 保持城区范围及全部既有来源。来源数、渲染体块数、测试数均不代表现实城区已经完整还原。
- 建筑、道路及地点用来源ID绑定；避免模糊名称或仅靠邻近距离匹配。同名异地图片、效果图、模型图不能作为建成实拍证据。
- 分开记录照片拍摄日、发表日、获取日以及影像采集日。未知值保持未知；服务版本、版权年和获取日不能当作拍摄日。
- 保留来源几何、原始高度及来源属性。照片引导的高度、楼层、模块和朝向作为独立展示估计；不能静默改写来源值。
- 确有证据的缺失楼体应补录，不为了维持旧计数放弃补楼。维护 `tools/data/shuyang/building-source-order.json`，新来源追加，旧索引不重排。来源记录索引、展开后的地图部件索引和专用体块索引不能混用。
- 更新生成数据时检查旧记录保留、重叠/冲突、内院和来源绑定；不能只改旧哈希或降低断言来获得通过。
- GCJ-02在线图层必须先转换到WGS84，再进入项目世界米制坐标。每组人工描图保留自己的像素尺寸、偏移、边界和参考信息。
- 参考原图放在被忽略的 `tools/data/shuyang/reference/`，不作为贴图或发布资产打包。可以提交来源URL、观察记录、方法及本项目渲染验收图。

## 代码与几何

- 直接维护ES模块。新相对模块加入 `index.html` 的canonical `modulepreload`；保留import map在预加载之前。
- 数据入口为 `tools/data/shuyang/`；`js/shuyang-geodata.js`、`js/building-geodata.bin.gz`及其他标注Generated的文件由生成器产生，不手工修补输出。
- 地图、展示主体、地面、碰撞与交通边界应使用同一组几何。保留真实道路曲线、孔洞和步道，不用整块地标包围盒封闭庭院。
- 大来源轮廓可能包含场地，不能把整块地块当作实际楼体。新增模型要核对原楼体是否被正确替换/保留，避免重复主体、浮空屋顶或误删来源建筑。
- 对已有实景屋顶关闭冲突的随机屋顶附件。按可定位照片细化；未核实的立面、入口、设备和树种保持通用表达或标注估计。
- 检查三角形绕序、有限顶点、屋顶总高、裁切互斥、道路避让和实际树木落位。候选树位数不等于最终树场接受数。
- 合并批处理后原模型子组可能为空。运行审计应检查最终Mesh/实例、射线和画面，不能只依据元数据或空分组。
- 优先复用材质与批处理，留意新增网格和顶点开销。局部材质或透明字牌选项不得无意改变其他地标。

## 验证

Windows PowerShell基线：

```powershell
$cases = Get-ChildItem tests -File |
  Where-Object { $_.Name -match '\.test\.(cjs|mjs)$' -and $_.Name -ne 'overpass.test.mjs' } |
  ForEach-Object FullName
node --test $cases
python -m unittest discover -s tests -p 'test_*.py'
```

- 当前2026-11-15基线为390项Node与2项Python。7项Overpass用例需Bash，上述Windows命令未运行它们；不要计入通过数。有Bash时可单独运行 `node --test tests/overpass.test.mjs`。
- 先做与变更有关的检查，再完成必要回归。纯文档或低影响链接修改无需添加镜像实现的测试。
- 视觉变更需在实际浏览器检查相关整体/近地视角；涉及灯光时核对相应时段，涉及地图或碰撞时检查实际行为。
- 静态服务器和浏览器可能缓存旧模块。确认运行的是本次代码；临时禁用缓存、相机覆盖及调试修改在验收结束后恢复。
- 具体证据保存至 `docs/acceptance/<主题-日期>/`。记录本次实际运行内容、来源/几何审计、渲染截图、未运行项和仍有的限制，不用局部检查宣称全城完成。

## 文档与发布维护

- 行为、数据量、来源策略、运行方式或发布流程变化时更新 `README.md`。开发约定变化时更新本文件。
- 持续还原进度写入 `docs/BUILDING_REFINEMENT_PROGRESS.md`；逐条清单通过 `node tools/audit-photo-refinement.mjs` 生成，实拍说明与限制同步维护。
- 原MIT版权、OSM/Overture ODbL、CNBH CC BY署名和第三方图片署名必须保留。
- 不提交凭据、虚拟环境、研究原图、临时发布目录及无关分享包。遵守现有 `.gitignore`。
- 发布打包前提交并保持源码工作区干净；`python tools/package-static-site.py`仅打包已提交运行文件。
- 发布目标只同步 `slop-shuyang/`。核对来源提交、manifest、目标测试、Pages成功状态及线上文件校验；不要在已提交证据中回填新发布SHA形成无休止提交循环。
