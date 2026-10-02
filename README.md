# dfthings · 三角洲变卖物统计

统计《三角洲行动》烽火地带的变卖物，包括收集品（藏品）、护甲、头盔、胸挂、背包和枪械：每件物品属于哪一档（大红/小红/大金/小金/大紫/小紫/蓝/绿/白）、在哪出现、卖多少钱；出现概率则靠自己记录开箱数据来统计。

纯前端，**双击 `index.html` 就能用**，不需要安装任何东西。

## 功能

- **物品总览**：492 件物品，可以按类别、分档、地图筛选，按价格、单格价值、品质排序；点开一件能看详情（描述、各磨损状态的价格、你记录里它出现过几次）。
- **分级统计**：各分档的物品数和价格中位数/最高价、「分档 × 地图」分布表，以及每档最值钱的物品。
- **出货记录 · 概率**：每开一个箱子记一笔（地图、模式、容器、出了什么，空箱也要记），工具会算出：
  - 每个分档的**每箱出现概率**，带 95% 置信区间（Wilson）
  - 按容器统计的出红率、出金率和平均价值
  - 出得最多的物品
  - 记录可以导出、导入 JSON，方便合并多人数据
- **数据说明**：数据来源和局限；也可以导入新的价格 JSON 覆盖旧价格。

## 分档规则

- 品质颜色来自官方图鉴的品质等级：红 > 金 > 紫 > 蓝 > 绿 > 白。
- 「大」和「小」按占用格子数划分，默认 **≥6 格算大**（页面上可以改成 4 或 9）。社区里这个说法不统一。
- 枪械在游戏里没有品质色，归为「无品质」；图鉴没收录的物品归为「品质未知」。

## 数据来源与局限

| 内容 | 来源 | 局限 |
|---|---|---|
| 品质、格子、产出地、属性 | 官方图鉴字段（playerhub.df.qq.com），取自 [zhuba-Ahhh/df-api](https://github.com/zhuba-Ahhh/df-api) 的快照 | 快照偏旧，产出地只覆盖零号大坝、长弓溪谷、航天基地 |
| 价格 | [orzice/DeltaForcePrice](https://github.com/orzice/DeltaForcePrice) 交易行价格，2026-01-09 快照 | 该项目已停更；价格波动大，可在页面导入新价格 |
| 旧图鉴缺失物品的品质/形状/格数 | [xxxsy11/DeltaForceAgent](https://github.com/xxxsy11/DeltaForceAgent)（2026-03，MIT） | 和旧图鉴交叉校验 326/327 一致 |
| 新物品图片地址 | [lvhj4/bingo](https://github.com/lvhj4/bingo)、[MuLiuSaMa/NexBox](https://github.com/MuLiuSaMa/NexBox) | 仍有 6 件没有图片 |
| 地图开放模式 | DeltaForceAgent 地图数据 | 模式是按地图推算的，不是逐件物品的数据 |
| 海洋之泪等的产地补充 | [攻略](https://www.18183.com/gonglue/202607/5sbgtvva.html)；`tools/supplement.json` 另存了[公开大红图鉴](https://www.sohu.com/a/937327976_122511859)的品质/格数作后备 | 新物品的产出地大多仍缺 |
| 容器经验分级 | [腾讯新闻 2025-10](https://news.qq.com/rain/a/20251027A01KIQ00) | 玩家经验，没有具体数值 |

**出现概率**：官方从没公布过爆率。网上流传的所谓「官方爆率」都找不到可核实的出处，这里不采用。概率只来自你自己记录的开箱数据，「模式」维度也一样。

## 重新生成数据

```
# 把 df-api 的物品文件整理成 .research/items_raw.json，把 price.json 放进 .research/
python tools/build_data.py      # 生成 data/items.js
```

图鉴缺失物品的补充数据在 `tools/supplement.json` 里。

## 文件

```
index.html / css/style.css / js/app.js   页面
data/items.js                            合并后的物品数据（由脚本生成）
tools/build_data.py                      数据合并脚本
tools/supplement.json                    手工补充数据（注明出处）
```
