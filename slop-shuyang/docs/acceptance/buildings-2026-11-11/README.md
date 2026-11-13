# 城区建筑补漏与属性保留核验

范围：当前沭阳城区，无扩区。参考 [slop-wuhan](https://github.com/LightYearZh/slop-wuhan) 的多源轮廓、来源记录与用途分型，继续使用本项目 Three.js / WebGPU 引擎。

## 数据

- 原版本 1,361 个 OSM 建筑记录；融合后 7,558 个来源对象，普通楼体实际渲染 7,544 个，14 个与专用地标相交，由地标模型替代。数量来自浏览器运行时 `ShuyangCityBlocks.userData.buildingCounts`。
- OSM 1,358、Overture 增量 6,200；多部件与关系拓扑保留后，地图共有 7,561 个多边形、4 个内院。
- 5,271 个 CNBH 2020 栅格估高、1 个 OSM 高度、2,286 个用途展示估计；不把模型估计标为实测。
- 再次执行离线融合和生成完成，统计一致；二进制与完整来源记录的逐项属性、量化、绕序、范围校验通过。

来源、方法和限制见 [`BUILDINGS.md`](../../../tools/data/shuyang/BUILDINGS.md) 与 [`building-audit.json`](../../../tools/data/shuyang/building-audit.json)。

## 渲染与交互

浏览器实机使用 `WebGPUBackend`，检查了默认街景、人民中路近景、县城高空、自动航拍和全屏地图。最终材质重载后未出现新的控制台错误。

- 用途控制立面：高层住宅不随机套办公幕墙，商业雨篷只在面向邻近公共道路的边生成。
- 涂料材质沿用原引擎窗玻璃 / 室内映射 / 窗台 / 空调细节，关闭旧式砖墙、广告残影与大檐口。
- 多部件与内院共用地图 / 碰撞 / 网格；地图缩到城区全图时仍展示建筑覆盖。
- 主体网格常驻；近处屋顶和店铺细节继续流式加载。
- 中央城市广场两栋住宅重复创建的问题已清除，住宅塔楼增加窗立面。
- 二进制升级为 SYB2，并增加资源版本号，避免读到旧 NYB1 缓存。

截图：[`街景`](../../../.screenshots/shuyang-buildings-street.png)、[`航拍`](../../../.screenshots/shuyang-buildings-aerial.png)、[`地图`](../../../.screenshots/shuyang-buildings-map.png)。

## 回归

211 项 Node 回归测试通过，0 失败，见 [`tests.log`](tests.log)。涵盖建筑解码、角度 / 绕序 / 内院、架空标高、临街商铺、用途样式，以及原有交通、碰撞、相机、灯光、触控和水面着色器测试。

`overpass.test.mjs` 的 7 项 shell 测试未纳入通过数量：Windows 默认没有 bash，Git Bash 也无法按该 POSIX 测试的 Windows shebang 运行假 curl。已终止该尝试；本轮没有修改 `overpass.sh` 或这些测试。本轮实际来源下载由 Python 脚本完成。

## 未解决的真实性边界

遥感轮廓并不保证全部楼栋都存在，CNBH 的 10 m 像元和 2020 年参考期不能复原单栋高层及后续新楼的准确高度。住宅颜色、窗洞与空调仍是区域化表达；专用地标仍是识别性体量。当前结果改善覆盖、轮廓与高低关系，未声称逐栋照片级复原。
