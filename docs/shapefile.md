# DXF 转 Shapefile

在“DXF 转 SHP”选择本地 ASCII DXF，运行后下载 ZIP。全部转换在浏览器 Worker 中进行；取消会终止 Worker，不上传文件。单文件最多100MB、最多200万顶点。

支持模型空间直接实体：POINT、LINE、普通 POLYLINE/LWPOLYLINE、TEXT/MTEXT文字定位点。闭合多段线默认保留为线，可显式选择独立简单面；面检查自交并闭合为顺时针外环，不推断嵌套孔洞，不合并地块。需要孔洞或CAD拓扑时应使用专门GIS/CAD处理。

ZIP按几何类型分别包含 points、lines、polygons 文件组，每组包含 SHP、SHX、DBF、CPG。DBF使用UTF-8；在GIS中用同名CPG读取中文。字段为LAYER图层、HANDLE句柄、ENTITY实体类型、TEXT原始文字、Z_MIN/Z_MAX实体高程范围。高程范围字段以文本保存数值精度；几何本身为二维，不保留每个顶点Z。文字仅为定位点，不保留字体、排版或CAD符号，TEXT可能含原始格式码。单属性超过254字节会报错，不静默截断。

块INSERT、圆/圆弧、SPLINE、HATCH、尺寸等未转换实体及布局空间对象列在 report.json 的 skipped 按类型统计中。解析库不识别的实体也由原始ENTITIES声明计入统计。圆弧凸度多段线、网格/拟合多段线和非默认OCS对象报错停止，避免输出失真的直线。需要保留这些对象时，先在CAD中复制并炸开所需块，把曲线按工程容差离散为普通直线段，再导出文本DXF。二进制DXF与DWG不支持。

坐标默认原样保留，不生成PRJ，也不自动标为WGS84。可以提供已有源PRJ的WKT内容（仅声明，不变换坐标；需要自行确认WKT正确）。另可在测量资料已经确认源数据属于CGCS2000对应三度分带时，显式选择25–45带补带号并生成相应PRJ；已有相同带号保留，其他带号报错。这只是补带号，绝不是重投影。自定义PRJ和补带号不能同时使用。

解压后将同名SHP/SHX/DBF/CPG/PRJ放在同一目录。在GIS中核对要素数量、图层属性、原坐标范围、未导出统计与测量坐标系。当前验收使用合成DXF及独立Shapefile读回，尚未验收用户真实底图。

格式依据：[ESRI Shapefile技术说明](https://www.esri.com/content/dam/esrisites/sitecore-archive/Files/Pdfs/library/whitepapers/pdfs/shapefile.pdf)。实现使用[dxf-parser](https://github.com/gdsestimating/dxf-parser)与[@mapbox/shp-write](https://github.com/mapbox/shp-write)，UTF-8 DBF由共享TypeScript核心写入。DXF坐标声明限制可参阅[GDAL DXF说明](https://gdal.org/en/stable/drivers/vector/dxf.html)。
