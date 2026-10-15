# DreamReel Sprint 25 交付报告：世界观设定集

- 任务 ID：`TASK-20261014-025`
- 工作流上下文：`.workflow/context-sprint25.yaml`
- 分支：`main`
- 最终状态：✅ 达成（LLM 抽取 + 关系 + 落盘 + API/CLI）

---

## 一、能力

> 每个小说项目产出**完整、互相关联的世界观**：种族 / 势力 / 重要事件 / 装备 / 文化（+ 地点 / 力量体系 / 其他），并建立实体间**关系**。

| 项 | 交付 |
|---|---|
| 实体抽取 | `worldbuildingService.extractWorld`：**分片 LLM 抽取（逐片容错）** + 合并去重 + 别名归一 + mentions 统计；启发式兜底 |
| 关系图 | 实体 `relations[{target,kind}]`（所属/敌对/盟友/参与/拥有/源于/位于…）；`listRelations` 解析到实体 id |
| 存储 | `storage/novels/<id>/worldbuilding/entities.json`；`storageService.novelWorldEntities` |
| 接口/CLI | `POST /:id/world/extract`、`GET /:id/world`、`/world/entities`、`/world/relations`；CLI `world / world-show / world-entities / world-relations` |

---

## 二、真实 E2E（《殖装》前 6 章）

```
world --provider llm --max-chapters 6 --chunk-size 3
→ provider: llm | entities: 23
  byType: 种族2 / 势力1 / 重要事件3 / 装备4 / 文化3 / 地点3 / 力量体系1 / 其他6
  relations: 42
```
示例关系：`第七世界-x35行星 -[源于]-> 核毁灭`、`27号废墟避难所 -[拥有]-> 熊帮`、`熊帮 -[拥有]-> 铜牙`。

---

## 三、测试与静态检查

| 项 | 结果 |
|---|---|
| `npm test` | **555 tests / 555 pass / 0 fail**（新增世界观 1 例） |
| 测试隔离 | 开发库未被修改 |
| `npm run lint` | 0 error / 0 warning |

---

## 四、已知限制与风险

1. **覆盖全书需分片批处理**：默认只抽前 30 章（可 `--max-chapters/--chunk-size` 调整）；全书需异步/配额（已记录）。
2. **"设计有关联"为抽取+关系**：实体关系的**补全/串联**（LLM 主动设计缺口）留作后续。
3. **"其他(other)"含人物**：模型会把部分角色归到 other；角色另有专门模块，后续可去重/归类。
4. 启发式兜底精度低（仅关键词后缀）。

---

## 五、新增 / 修改文件

**新增**：`src/models/WorldEntity.js`、`src/services/worldbuildingService.js`、`.workflow/context-sprint25.yaml`、`docs/sprint25-delivery-report.md`

**修改**：`src/services/storageService.js`、`src/routes/novels.js`、`scripts/novel.js`、`tests/novelSeries.test.js`、`README.md`

---

## 六、结论

Sprint 25 让**每个小说项目具备可抽取、可关联的世界观设定集**（种族/势力/事件/装备/文化…）。真实 LLM 验证 23 实体 + 42 关系。全量 **555/555/0**。

**最终状态：`GLOBAL_DONE`。**
