# 外部视频生成工具 · 对接说明（分镜级图生视频）

> 版本：v1（2026-10-16）
> 适用：由外部工具读取本项目的**分镜清单 + 设定图**，逐分镜生成视频，放回**指定目录**，
> 再由 DreamReel（小说剧场）导入并**按分镜拼接成片**。
> 状态：契约已定稿；App 侧「导出清单 / 导入回传」接口按本说明实现。

---

## 0. 一句话流程

```
DreamReel 导出：分镜清单(manifest.json) + 设定图(refs/)  →  外部工具逐分镜图生视频
   →  放回：shots/<episodeId>/shotNN.mp4  →  DreamReel 导入 + 拼接成片
```

外部工具**只需**关心两件事：**读**导出目录、**写**回传目录。命名以本说明为准（工具本身无固定命名）。

---

## 1. 目录约定

以项目根为基准（`<PROJECT>/storage/`）：

| 用途 | 路径 |
|---|---|
| **导出（读）** | `<PROJECT>/storage/novels/<novelId>/handoff/<episodeId>/` |
| **回传（写）** | `<PROJECT>/storage/videos/novels/<novelId>/shots/<episodeId>/` |

- `<novelId>`：小说项目 ID（导出时给出）。
- `<episodeId>`：单集 ID（导出时给出）。
- 回传目录若不存在，工具需自行创建。

---

## 2. 导出内容（外部工具「读」）

```
handoff/<episodeId>/
├─ manifest.json      # 机器读：本说明第 3 节
├─ storyboard.md      # 人读：分镜表（工具作者可忽略）
├─ refs/              # 设定图实体文件（角色/场景/道具…），工具直接读本地文件
│   ├─ shot01_角色_奥古斯都.png
│   ├─ shot01_场景_王城.png
│   └─ shot01_道具_殖装装甲.png
├─ TOOL_GUIDE.md      # 本说明（随导出附带）
└─ prompt.txt         # （兼容旧版）整集提示词，仅参考
```

### refs/ 命名规则
`shot{NN}_{类别中文}_{名称}.<ext>`
- `NN`：分镜序号，两位（`01`,`02`…）。
- 类别：`角色 / 衣物 / 装备 / 建筑 / 场景 / 道具 / 其他`。
- 同一分镜同类别重名时追加 `_2`、`_3`。
- `<ext>` 通常 `png`。

---

## 3. manifest.json 结构（机器读，schemaVersion=1）

```json
{
  "schemaVersion": 1,
  "novelId": "47dd19996161517b",
  "novelTitle": "殖装",
  "episodeId": "6dcc1b16c973abde",
  "episodeNo": 1,
  "episodeTitle": "第1集 星海纪元",
  "targetSeconds": 90,
  "ratio": "16:9",
  "resolution": "1080p",
  "style": { "name": "冷峻科幻", "visual": "金属冷色调，高对比，霓虹" },
  "shots": [
    {
      "index": 1,
      "duration": 6.5,
      "prompt": "广角：银河帝国首都罗米克王城高耸入云，晨雾中的帝国舰队升空。冷峻科幻，金属冷色调，高对比，霓虹",
      "dialogue": "奥古斯都：秩序即永恒。",
      "narration": "星海纪元的第一缕晨光，照在王城的尖塔上。",
      "shotType": "wide",
      "cameraMovement": "slow_push_in",
      "referenceImages": [
        { "role": "character", "name": "奥古斯都", "file": "refs/shot01_角色_奥古斯都.png", "url": "/storage/images/novels/47dd19996161517b/assets/aaaa.png" },
        { "role": "scene", "name": "罗米克王城", "file": "refs/shot01_场景_罗米克王城.png", "url": "/storage/images/novels/47dd19996161517b/assets/bbbb.png" }
      ],
      "outputFile": "shot01.mp4"
    },
    {
      "index": 2,
      "duration": 5.0,
      "prompt": "特写：奥古斯都冷峻的侧脸，殖装装甲的金属纹理反光。",
      "dialogue": "",
      "narration": "",
      "shotType": "close-up",
      "cameraMovement": "static",
      "referenceImages": [
        { "role": "character", "name": "奥古斯都", "file": "refs/shot02_角色_奥古斯都.png", "url": "…" },
        { "role": "equipment", "name": "殖装装甲", "file": "refs/shot02_装备_殖装装甲.png", "url": "…" }
      ],
      "outputFile": "shot02.mp4"
    }
  ]
}
```

### 字段说明
| 字段 | 类型 | 说明 |
|---|---|---|
| `schemaVersion` | int | 固定 `1`，便于工具兼容 |
| `novelId` / `episodeId` | string | 用于拼回传目录 |
| `targetSeconds` | number | 本集目标成片时长（所有 shot.duration 之和 ≈ 此值） |
| `ratio` / `resolution` | string | `"16:9"` / `"1080p"`（生成视频须匹配） |
| `shots[].index` | int | 分镜序号（从 1） |
| `shots[].duration` | number | 该分镜目标时长（秒） |
| `shots[].prompt` | string | **图生视频提示词**（已含风格词；直接用） |
| `shots[].dialogue` | string | 台词（可选，供工具做口型/字幕，可不实现） |
| `shots[].narration` | string | 旁白（可选） |
| `shots[].shotType` | string | 景别：`wide/medium/close-up/…`（可选参考） |
| `shots[].cameraMovement` | string | 运镜（可选参考） |
| `shots[].referenceImages[]` | array | **设定图参考**；`file` 相对导出目录，`url` 为 App 内地址（工具优先读 `file`） |
| `shots[].outputFile` | string | **该分镜的回传文件名（必须一致）**，如 `shot01.mp4` |

> 工具**至少**使用 `prompt` + `referenceImages[].file`；其余为可选增强。

---

## 4. 回传要求（外部工具「写」）

- **位置**：`<PROJECT>/storage/videos/novels/<novelId>/shots/<episodeId>/`
- **文件名**：严格等于 manifest 里每条的 `outputFile`（即 `shotNN.mp4`）。
- **数量**：每个分镜一段；顺序无关（以文件名为准）。
- **格式**：`mp4`（H.264 视频 + AAC 音频）。
- **规格**：分辨率与 `resolution` 一致，比例与 `ratio` 一致；每段时长 ≈ 对应 `duration`（建议 ±0.5s，超出由 App 裁剪/补齐）。
- **缺失**：某分镜无法生成可跳过；App 导入时会检测并列出缺失项（不阻断其余）。

**示例结果**
```
storage/videos/novels/47dd19996161517b/shots/6dcc1b16c973abde/
├─ shot01.mp4
├─ shot02.mp4
└─ shot03.mp4
```

---

## 5. 工具实现建议（伪代码）

```text
root = "<PROJECT>/storage"
exp  = `${root}/novels/${novelId}/handoff/${episodeId}`
out  = `${root}/videos/novels/${novelId}/shots/${episodeId}`
mkdir -p out
for shot in manifest.shots:
    imgs = [ `${exp}/${r.file}` for r in shot.referenceImages if exists ]
    video = imageToVideo(prompt=shot.prompt, images=imgs,
                         duration=shot.duration, ratio=manifest.ratio,
                         resolution=manifest.resolution)
    save(video, `${out}/${shot.outputFile}`)
# 完成（可选）写 done.json: {"episodeId":..., "done":[1,2,3], "tool":"..."}
```

---

## 6. 常见问题

- **参考图有多个角色/场景怎么办？** 按 `referenceImages` 全部取用；若工具只支持首帧，取 `role=scene` 或第 1 张即可（不强求）。
- **提示词要自己拼吗？** 不用，`prompt` 已拼好（分镜描述 + 风格）。可选再追加 `dialogue`/`shotType`。
- **能改文件名吗？** 不建议；若你的工具强制改名，请**保留 `shotNN`** 序号，并在文件名含 `NN` 即可（App 按 `NN` 匹配）。
- **能一次生成整集一段吗？** 可以但不推荐：成片会退化为单段循环。请尽量逐分镜输出。
- **输出到别的目录可以吗？** 可以，但需在 App 导入时指定目录；默认按第 1 节。

---

## 7. App 侧对应接口（供参考，联调时提供）

| 动作 | 接口（规划） | 产出/作用 |
|---|---|---|
| 导出分镜清单 | `POST /api/novels/:id/episodes/:eid/handoff/shots` | 生成第 1–2 节目录与文件，返回导出路径 |
| 导入回传视频 | `POST /api/novels/:id/episodes/:eid/shots/import` | 扫描回传目录，写回每个分镜的 `videoUrl` |
| 拼接成片 | `POST /api/novels/:id/episodes/:eid/compose` | 按分镜顺序拼接为成片 |

> 本说明文件会随导出动作**一并复制到导出目录**（`TOOL_GUIDE.md`），确保工具作者拿到最新版本。
