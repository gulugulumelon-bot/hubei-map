# 🍚 蹭饭图 · 中国平面地图版

一个静态的中国平面地图"蹭饭"网页：省级热力着色、悬停查看蹭饭人列表、点击省份下钻到市级地图。
纯 SVG 渲染，无动画（无 3D、无旋转、无动效），轻量快速，**可直接部署到 GitHub Pages**。

## ✨ 功能

- 🗺️ **中国平面地图**：省级行政区 SVG 渲染，含九段线（虚线描边，不填色）
- 🎨 **热力着色**：地区人数越多颜色越深（浅金 → 橙 → 深红），左下角有图例
- 💬 **悬停列表**：鼠标移到省份/城市上，弹出该地区蹭饭人列表（含联系方式）
- 👇 **点省看市**：点击省份进入该省市级地图（21+ 市级区域），顶栏"返回全国"回退
- 👥 **人物管理**：姓名 + 省份 + 城市 + 联系方式添加蹭饭人；人物以金色圆点标注在地图上，点击查看详情/删除
- 🔍 搜索、📤 导出、📥 导入、🎲 示例数据、🧹 清空
- 💾 蹭饭人数据 = **共享名单（所有人可见）** + **访客本地增删**（localStorage，与 3D 版互通）
- 📱 **手机端适配**：侧边栏自动变为底部抽屉面板（概况/添加/列表标签页）+ 底部导航；
  触屏点按区域弹出信息卡（含人员列表与"查看市级地图"按钮），弹窗改为底部抽屉式，适配刘海屏安全区
- 🔍 **缩放与平移**：桌面滚轮缩放 + 拖拽平移；手机**双指捏合缩放 + 单指拖拽 + 双击放大**；
  右下角 ＋/－/⟲ 缩放按钮（手机端自动上移避开底部导航）；人物圆点加大点击热区

## 👥 共享名单（让所有人看到同一份信息）

编辑项目根目录的 **`data/people.json`**，保存并推送后，**所有访客打开页面都会看到这份名单**
（无需任何后端）。格式如下：

```json
{
  "version": 1,
  "people": [
    {
      "name": "张三",
      "provinceCode": "440000",
      "provinceName": "广东省",
      "cityName": "深圳市",
      "contact": "wx: zhangsan88"
    },
    {
      "name": "李四",
      "provinceCode": "330000",
      "provinceName": "浙江省",
      "cityName": "杭州市",
      "contact": "13800000000"
    }
  ]
}
```

字段说明：

| 字段 | 必填 | 说明 |
|---|---|---|
| `name` | ✅ | 姓名 |
| `provinceCode` | ✅ | 省级行政区划代码（6 位数字，如 440000=广东、330000=浙江、110000=北京） |
| `provinceName` | 建议 | 省份名（显示用，不填则显示代码） |
| `cityName` | 可选 | 城市/区县名（不填则标注在省级中心） |
| `contact` | 可选 | 微信 / 电话等联系方式 |
| `lat` / `lng` | 可选 | 坐标，**不填会自动**按城市/省级中心计算 |

> - 推送后，访客**首次打开**即看到共享名单；你之后更新名单，所有人下次刷新即可看到最新版
> - 访客自己添加的人存在**他们自己的浏览器**里，不与共享名单冲突；访客删除共享人员仅对自己生效
> - 当前 `people.json` 中的"示例·张三"仅为演示，替换为真实名单即可

## 🌐 部署到 GitHub Pages

本工程全部使用**相对路径**，无需任何配置即可在 GitHub Pages 的子目录下运行：

1. 在 GitHub 新建仓库（如 `cengfan-map`），复制仓库地址
2. 在本地工程目录执行：

   ```bash
   git init
   git add .
   git commit -m "init: 蹭饭图平面地图版"
   git branch -M main
   git remote add origin https://github.com/<用户名>/<仓库名>.git
   git push -u origin main
   ```

3. 在仓库 **Settings → Pages → Build and deployment** 中，Source 选择
   **Deploy from a branch**，Branch 选 `main` / `/(root)`，保存
4. 等待 1~2 分钟，访问 `https://<用户名>.github.io/<仓库名>/` 即可

> 说明：
> - `.nojekyll` 已包含，确保 GitHub Pages 按纯静态站点处理
> - `where are my classmates-/`（3D 地球版，独立 git 仓库）已在 `.gitignore` 中排除，
>   不会进入本仓库
> - GitHub Pages 上蹭饭数据保存在**每位访问者自己的浏览器**（localStorage）中；
>   想让朋友看到同一份数据，可用"📤 导出"生成 JSON 发给他们，"📥 导入"即可载入

## 🚀 本地运行（可选）

本地预览时可双击 `启动蹭饭图.bat`（需 [Node.js](https://nodejs.org/)），或：

```bash
node server.js
# 然后访问 http://127.0.0.1:8000
```

> 页面需通过 HTTP 访问（fetch 本地地理数据，浏览器对 `file://` 有跨域限制）。

## 📂 目录结构

```
蹭饭图/
├── index.html            页面入口
├── server.js             本地静态服务器（Node 内置 http，仅本地预览用）
├── 启动蹭饭图.bat         本地启动脚本（仅 Windows）
├── .nojekyll             GitHub Pages 纯静态标记
├── .gitignore            忽略独立项目与系统文件
├── css/style-2d.css      样式
├── js/
│   ├── core.js           纯逻辑：统计、着色（深浅渐变）、工具函数
│   ├── data.js           数据层：共享名单 + 地理数据加载 + 访客本地增删
│   └── app-2d.js         平面地图主逻辑（d3-geo + SVG）
├── lib/d3.min.js         d3 完整构建（投影 / 路径生成）
├── data/
│   ├── people.json       共享名单（所有人可见，编辑此文件即可全员更新）
│   ├── china.json        全国省级边界
│   └── provinces/*.json  各省市级边界
└── scripts/pages-check.js  GitHub Pages 兼容性自检脚本
```

## 🗂️ 数据来源

- 省市边界：阿里云 DataV GeoAtlas（`geo.datav.aliyun.com/areas_v3/bound/`），已下载到本地，离线可用。
  DataV 外环为逆时针（RFC 7946），应用加载时自动反转绕向（`js/core.js` 的 `rewindGeoJson`），
  保证 d3 的 geoBounds / fitExtent 得到正确的包围盒。
- 平面投影：d3-geo（geoMercator）

## ❓ 常见问题

- **本地地图不显示**：请通过 `node server.js` 或 .bat 启动后访问，不要直接双击 index.html
- **怎样让所有人看到名单**：编辑 `data/people.json` 并推送即可，无需其他操作（见上文"共享名单"）
- **访客自己添加/删除的人**：只存在访客自己的浏览器 localStorage 中；"🧹 清空"只清空访客本人的增删，会回到共享名单
- **台湾省无市级细分**：DataV 未提供台湾市级边界，下钻后显示省级边界兜底
- **手机端交互**：触屏设备点按省份会先弹出该省信息卡，点"🗺️ 查看市级地图"进入市级视图；桌面端保持悬停提示 + 单击直接下钻
