<quote-container>
**文档定位**：交付判定视角的正式验收标准，供研发完成后逐条验证、组长最终确认。
**上游依据**：
- 架构与完成度评估报告（2026-10-04）：核心链路 E2E 验证通过；P0 风险为 AI 全 mock、本地 JSON 存储、用户认证占位
- UI 重新设计方案（对标 LibTV，2026-10-04）：P0（左侧导航+首页 Hero）、P1（作品广场 tab/徽章/复刻入口+编辑器质感）
- 质检官风险用例预研（子任务 7692808985237277903）：审查视角风险点已纳入本清单作为验收关注项
</quote-container>

---

## 一、验收标准总览
### 1.1 验证方式图例

<lark-table rows="9" cols="3" header-row="true" column-widths="126,225,328">

  <lark-tr>
    <lark-td>
      图例
    </lark-td>
    <lark-td>
      含义
    </lark-td>
    <lark-td>
      说明
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      自动测试
    </lark-td>
    <lark-td>
      可通过已有测试套件或自动化脚本验证
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      🖐️
    </lark-td>
    <lark-td>
      手动操作
    </lark-td>
    <lark-td>
      需人工在界面上执行操作并观察结果
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      👁️
    </lark-td>
    <lark-td>
      人工确认
    </lark-td>
    <lark-td>
      需人工目视/审阅判断是否符合预期
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      ✅ Mock
    </lark-td>
    <lark-td>
      Mock 模式下可验证
    </lark-td>
    <lark-td>
      无需真实 API Key，在当前代码库即可验证
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      🔑 真实
    </lark-td>
    <lark-td>
      需真实 API Key
    </lark-td>
    <lark-td>
      必须接入真实模型/服务后才能验证
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      ⚠️ 部署
    </lark-td>
    <lark-td>
      依赖目标部署环境
    </lark-td>
    <lark-td>
      需在具体部署环境（云服务器/PaaS/K8s）上验证
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      ❓ 待补充
    </lark-td>
    <lark-td>
      需研发工程师补充说明
    </lark-td>
    <lark-td>
      当前上游证据不足以形成标准，需研发确认
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      🔒 待确认
    </lark-td>
    <lark-td>
      需组长最终确认
    </lark-td>
    <lark-td>
      标准已拟定，需组长在验收前做最终判定
    </lark-td>
  </lark-tr>
</lark-table>

### 1.2 标准分级

<lark-table rows="4" cols="3" header-row="true" column-widths="110,183,328">

  <lark-tr>
    <lark-td>
      分级
    </lark-td>
    <lark-td>
      含义
    </lark-td>
    <lark-td>
      不通过的后果
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      P0
    </lark-td>
    <lark-td>
      阻断上线
    </lark-td>
    <lark-td>
      任一项不通过，MVP 不得发布
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      P1
    </lark-td>
    <lark-td>
      严重影响体验
    </lark-td>
    <lark-td>
      累计超过 3 项不通过，或单一模块超过 50% 不通过，不得发布
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      P2
    </lark-td>
    <lark-td>
      优化项
    </lark-td>
    <lark-td>
      记录问题清单，发布后迭代修复
    </lark-td>
  </lark-tr>
</lark-table>

---

## 二、功能验收标准
### 2.1 核心创作链路（P0）
<quote-container>
**模块目标**：用户从创建项目到导出成片的完整创作流程可用。
**上游证据**：架构报告 §3.1「核心创作链路」、§4.2「本地 E2E 验证结果」确认链路可跑通；§5.2 指出 shotId 不一致、JSON 存储、mock 模式为关键风险。
</quote-container>


<lark-table rows="16" cols="7" header-row="true" column-widths="80,85,288,328,80,80,158">

  <lark-tr>
    <lark-td>
      序号
    </lark-td>
    <lark-td>
      验收项
    </lark-td>
    <lark-td>
      预期行为
    </lark-td>
    <lark-td>
      通过判定
    </lark-td>
    <lark-td>
      验证方式
    </lark-td>
    <lark-td>
      Mock 可验
    </lark-td>
    <lark-td>
      备注
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-01
    </lark-td>
    <lark-td>
      项目创建
    </lark-td>
    <lark-td>
      POST /api/projects 返回 201，含项目 ID；项目写入持久化存储
    </lark-td>
    <lark-td>
      接口返回正确 JSON，db.json 中可查询到该项目
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §3.1「项目 CRUD：已确认」
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-02
    </lark-td>
    <lark-td>
      项目 CRUD
    </lark-td>
    <lark-td>
      支持增删改查、搜索筛选（7 维）、排序
    </lark-td>
    <lark-td>
      所有操作返回正确，筛选结果符合条件
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §3.1
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-03
    </lark-td>
    <lark-td>
      AI 生成剧本
    </lark-td>
    <lark-td>
      POST /api/script/generate 返回分镜列表，自动同步到项目镜头
    </lark-td>
    <lark-td>
      15 秒目标时长生成 ≥4 个分镜；项目详情中可见对应镜头
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §4.2 E2E 验证通过
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-04
    </lark-td>
    <lark-td>
      shotId 一致性
    </lark-td>
    <lark-td>
      剧本生成的分镜 shotId 与项目内保存的 shotId 一致或可正确映射
    </lark-td>
    <lark-td>
      通过项目详情接口获取的 shotId 可直接用于后续镜头操作
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      **质检官风险 R-P0-01**：架构报告 §4.2 已发现此问题，需确认是否已修复或有规避文档
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-05
    </lark-td>
    <lark-td>
      单镜视频生成
    </lark-td>
    <lark-td>
      POST /api/video/generate 返回 202，异步完成后状态变为 completed
    </lark-td>
    <lark-td>
      mock 模式下 12 秒内完成；项目镜头状态正确流转
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §4.2「生成单镜视频：✅ 成功，12 秒内完成」
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-06
    </lark-td>
    <lark-td>
      异步状态不丢失
    </lark-td>
    <lark-td>
      服务重启时，进行中的生成任务状态可恢复或正确标记失败
    </lark-td>
    <lark-td>
      模拟重启后，任务状态不为永久 generating
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      **质检官风险 R-P0-01**：JSON 存储重启后需验证
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-07
    </lark-td>
    <lark-td>
      视频合成导出
    </lark-td>
    <lark-td>
      POST /api/export/project/:id/sync 在有完成镜头时返回 MP4
    </lark-td>
    <lark-td>
      文件写入 storage/exports/，可正常播放
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §4.2「合成导出：✅ 成功」
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-08
    </lark-td>
    <lark-td>
      导出容错
    </lark-td>
    <lark-td>
      合成导出时存在未完成镜头，系统有降级处理（跳过或提示）
    </lark-td>
    <lark-td>
      不崩溃、不生成黑屏片段，有明确用户提示
    </lark-td>
    <lark-td>
      🖐️
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      **质检官风险 R-P0-01**
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-09
    </lark-td>
    <lark-td>
      批量镜头生成
    </lark-td>
    <lark-td>
      支持多镜并行生成，有并发控制（VIDEO_MAX_CONCURRENT）
    </lark-td>
    <lark-td>
      并行引擎正常调度，无任务丢失，并发数不超限制
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §3.1「批量镜头生成：未验证（代码完整）」
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-10
    </lark-td>
    <lark-td>
      角色 CRUD + 参考图锁定
    </lark-td>
    <lark-td>
      支持增删改查角色，可锁定参考图
    </lark-td>
    <lark-td>
      参考图路径正确保存，角色数据持久化
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §3.1
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-11
    </lark-td>
    <lark-td>
      导演模式
    </lark-td>
    <lark-td>
      支持选择 5 位导演档案并应用到项目
    </lark-td>
    <lark-td>
      GET /api/directors 返回 5 位导演；应用后 prompt 注入正确
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §4.3「GET /api/directors：✅ 200，返回 5 位导演」
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-12
    </lark-td>
    <lark-td>
      场景库
    </lark-td>
    <lark-td>
      内置 22 个场景正常返回，自定义场景 CRUD 正常
    </lark-td>
    <lark-td>
      GET /api/scenes 返回 22 个场景
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §4.3
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-13
    </lark-td>
    <lark-td>
      一键配音 + 字幕
    </lark-td>
    <lark-td>
      支持选择音色生成配音，输出字幕文件
    </lark-td>
    <lark-td>
      音频和字幕文件格式正确，可正常播放/显示
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §3.1「一键配音+字幕：未验证（代码完整）」
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-14
    </lark-td>
    <lark-td>
      BGM/音效库 + 三轨混音
    </lark-td>
    <lark-td>
      可选 BGM 和音效，合成时三轨混音输出
    </lark-td>
    <lark-td>
      videoCompositingService._buildMixedAudioTrack 输出正常
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §3.1
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-15
    </lark-td>
    <lark-td>
      创意片头
    </lark-td>
    <lark-td>
      支持选择 4 套模板生成 3-5 秒片头
    </lark-td>
    <lark-td>
      返回片头视频；非字体缺失环境 titleRendered=true
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §4.1「唯一失败测试：因字体缺失导致」
    </lark-td>
  </lark-tr>
</lark-table>

**【需确认项】**
- 🔒 F-04 shotId 一致性：如未修复，需研发提供规避文档（如「始终通过项目详情获取 shotId」）
- 🔒 F-06 异步状态恢复：需研发工程师确认重启后状态恢复机制实现方式
---

### 2.2 用户账户与认证（P1）
<quote-container>
**模块目标**：基础用户认证可用，默认用户模式不影响核心链路演示。
**上游证据**：架构报告 §3.2「JWT 认证：未验证（代码完整）」、§5.2「无用户认证（仅有 JWT 框架）」为 P1 差距。
</quote-container>


<lark-table rows="5" cols="7" header-row="true" column-widths="80,80,139,139,80,80,140">

  <lark-tr>
    <lark-td>
      序号
    </lark-td>
    <lark-td>
      验收项
    </lark-td>
    <lark-td>
      预期行为
    </lark-td>
    <lark-td>
      通过判定
    </lark-td>
    <lark-td>
      验证方式
    </lark-td>
    <lark-td>
      Mock 可验
    </lark-td>
    <lark-td>
      备注
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-16
    </lark-td>
    <lark-td>
      JWT 认证框架
    </lark-td>
    <lark-td>
      注册/登录返回 JWT Token，后续请求可携带验证
    </lark-td>
    <lark-td>
      Token 可正确解析，携带有效 Token 的请求可通过鉴权
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §3.2
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-17
    </lark-td>
    <lark-td>
      用户注册/登录
    </lark-td>
    <lark-td>
      支持用户名密码注册、登录
    </lark-td>
    <lark-td>
      密码经 scrypt 哈希存储，登录返回正确 Token
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §3.2
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-18
    </lark-td>
    <lark-td>
      默认用户模式
    </lark-td>
    <lark-td>
      未登录时可使用 default 用户访问核心链路
    </lark-td>
    <lark-td>
      核心创作链路（创建项目→生成→导出）在匿名状态下可用
    </lark-td>
    <lark-td>
      🖐️
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      架构报告 §5.2「用户系统仅为占位（default 用户）」为已知设计
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-19
    </lark-td>
    <lark-td>
      数据隔离
    </lark-td>
    <lark-td>
      不同用户（JWT 用户 vs default 用户）的数据互相隔离
    </lark-td>
    <lark-td>
      用户 A 无法看到/修改用户 B 的项目
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      **质检官风险 R-P1-01**
    </lark-td>
  </lark-tr>
</lark-table>

**【需确认项】**
- ❓ F-19 数据隔离：需研发工程师确认当前是否已实现多用户数据隔离，或仍为全局共享
---

### 2.3 项目管理增强（P1）
<quote-container>
**模块目标**：项目搜索、标签、收藏、版本、回收站等增强功能可用。
**上游证据**：架构报告 §3.3 列出 9 项功能，均为「未验证（代码完整）」。
</quote-container>


<lark-table rows="6" cols="7" header-row="true" column-widths="80,80,169,169,80,80,80">

  <lark-tr>
    <lark-td>
      序号
    </lark-td>
    <lark-td>
      验收项
    </lark-td>
    <lark-td>
      预期行为
    </lark-td>
    <lark-td>
      通过判定
    </lark-td>
    <lark-td>
      验证方式
    </lark-td>
    <lark-td>
      Mock 可验
    </lark-td>
    <lark-td>
      备注
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-20
    </lark-td>
    <lark-td>
      项目搜索/筛选/排序
    </lark-td>
    <lark-td>
      支持 7 维筛选 + 多字段排序
    </lark-td>
    <lark-td>
      筛选结果符合条件，排序顺序正确
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §3.3
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-21
    </lark-td>
    <lark-td>
      项目标签
    </lark-td>
    <lark-td>
      支持增删查项目标签
    </lark-td>
    <lark-td>
      project.tags 字段正确更新和持久化
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §3.3
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-22
    </lark-td>
    <lark-td>
      项目收藏/归档
    </lark-td>
    <lark-td>
      支持 toggle 收藏和归档状态
    </lark-td>
    <lark-td>
      toggleFavorite/toggleArchive 正确持久化
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §3.3
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-23
    </lark-td>
    <lark-td>
      版本历史
    </lark-td>
    <lark-td>
      支持自动/手动保存、回滚
    </lark-td>
    <lark-td>
      versionService 正确保存版本，回滚后数据一致
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §3.3
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-24
    </lark-td>
    <lark-td>
      回收站
    </lark-td>
    <lark-td>
      删除项目进入回收站，支持恢复和彻底删除
    </lark-td>
    <lark-td>
      软删除机制正确，恢复后数据完整
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §3.3
    </lark-td>
  </lark-tr>
</lark-table>

---

### 2.4 社区与协作（P1）
<quote-container>
**模块目标**：作品广场、创作者主页、协作评论等社区功能可用。
**上游证据**：架构报告 §3.5 列出相关功能，均为「未验证（代码完整）」。
</quote-container>


<lark-table rows="6" cols="7" header-row="true" column-widths="80,80,123,213,80,80,82">

  <lark-tr>
    <lark-td>
      序号
    </lark-td>
    <lark-td>
      验收项
    </lark-td>
    <lark-td>
      预期行为
    </lark-td>
    <lark-td>
      通过判定
    </lark-td>
    <lark-td>
      验证方式
    </lark-td>
    <lark-td>
      Mock 可验
    </lark-td>
    <lark-td>
      备注
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-25
    </lark-td>
    <lark-td>
      作品广场
    </lark-td>
    <lark-td>
      公开作品流正常展示，支持分类筛选、点赞
    </lark-td>
    <lark-td>
      galleryService 返回公开作品，筛选和点赞正常
    </lark-td>
    <lark-td>
      🖐️
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §3.5
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-26
    </lark-td>
    <lark-td>
      创作者主页
    </lark-td>
    <lark-td>
      展示创作者作品网格和统计
    </lark-td>
    <lark-td>
      creatorService 返回正确数据，页面渲染正常
    </lark-td>
    <lark-td>
      🖐️
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §3.5
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-27
    </lark-td>
    <lark-td>
      协作评论系统
    </lark-td>
    <lark-td>
      支持按镜头筛选评论、标记解决
    </lark-td>
    <lark-td>
      collaborationService 评论 CRUD 正常
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §3.5
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-28
    </lark-td>
    <lark-td>
      模板市场
    </lark-td>
    <lark-td>
      10 个内置模板正常返回，支持从模板创建项目
    </lark-td>
    <lark-td>
      GET /api/templates 返回 10 个模板
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §4.3
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-29
    </lark-td>
    <lark-td>
      风格迁移工坊
    </lark-td>
    <lark-td>
      15+ 风格预设可选择并应用
    </lark-td>
    <lark-td>
      GET /api/styles 返回 15+ 风格
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §4.3
    </lark-td>
  </lark-tr>
</lark-table>

---

### 2.5 商业化与运营（P1）
<quote-container>
**模块目标**：额度、订阅、统计等商业化框架可用（模拟模式）。
**上游证据**：架构报告 §3.2「订阅付费：未验证（Stripe 预留）」、§5.2「无真实支付接入」为 P1 差距。
</quote-container>


<lark-table rows="4" cols="7" header-row="true" column-widths="80,80,164,164,80,80,90">

  <lark-tr>
    <lark-td>
      序号
    </lark-td>
    <lark-td>
      验收项
    </lark-td>
    <lark-td>
      预期行为
    </lark-td>
    <lark-td>
      通过判定
    </lark-td>
    <lark-td>
      验证方式
    </lark-td>
    <lark-td>
      Mock 可验
    </lark-td>
    <lark-td>
      备注
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-30
    </lark-td>
    <lark-td>
      额度系统
    </lark-td>
    <lark-td>
      按订阅计划动态限制创作次数
    </lark-td>
    <lark-td>
      quotaService 正确计算剩余额度并拦截超限请求
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §3.2
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-31
    </lark-td>
    <lark-td>
      订阅计划展示
    </lark-td>
    <lark-td>
      4 档订阅计划正确展示
    </lark-td>
    <lark-td>
      前端可查看 4 档计划详情
    </lark-td>
    <lark-td>
      🖐️
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §3.2
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      F-32
    </lark-td>
    <lark-td>
      创作数据统计
    </lark-td>
    <lark-td>
      仪表盘展示 14 天趋势、风格分布等
    </lark-td>
    <lark-td>
      statsService 返回正确统计数据
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      基于架构报告 §3.2
    </lark-td>
  </lark-tr>
</lark-table>

---

## 三、UI 验收标准
### 3.1 全局布局（P0）
<quote-container>
**模块目标**：LibTV 式左侧导航布局正确实现，所有原有功能入口可访问。
**上游证据**：UI 方案 §5.2「全局布局重构」为 P0；§7.2 指出「左侧导航实现不完整」为 P1 风险。
</quote-container>


<lark-table rows="5" cols="7" header-row="true" column-widths="80,86,136,140,80,80,136">

  <lark-tr>
    <lark-td>
      序号
    </lark-td>
    <lark-td>
      验收项
    </lark-td>
    <lark-td>
      预期行为
    </lark-td>
    <lark-td>
      通过判定
    </lark-td>
    <lark-td>
      验证方式
    </lark-td>
    <lark-td>
      Mock 可验
    </lark-td>
    <lark-td>
      备注
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      UI-01
    </lark-td>
    <lark-td>
      左侧固定导航
    </lark-td>
    <lark-td>
      顶部 12+ 链接迁移到左侧边栏，分组清晰
    </lark-td>
    <lark-td>
      左侧导航固定 220px 宽，含核心/创作工具/更多/回收站分组
    </lark-td>
    <lark-td>
      👁️
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      UI 方案 P0
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      UI-02
    </lark-td>
    <lark-td>
      导航入口完整性
    </lark-td>
    <lark-td>
      所有原有顶部导航中的功能入口在左侧导航中均有对应
    </lark-td>
    <lark-td>
      无功能入口丢失；原有顶部链接均可通过左侧导航访问
    </lark-td>
    <lark-td>
      🖐️
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      **质检官风险 R-P1-02**：防止入口丢失
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      UI-03
    </lark-td>
    <lark-td>
      顶部 Header 精简
    </lark-td>
    <lark-td>
      顶部仅保留额度、通知、主题、语言、用户头像
    </lark-td>
    <lark-td>
      顶部无大量导航链接，视觉轻量
    </lark-td>
    <lark-td>
      👁️
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      UI 方案 §5.2
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      UI-04
    </lark-td>
    <lark-td>
      移动端适配
    </lark-td>
    <lark-td>
      <768px 时左侧导航隐藏，恢复汉堡菜单 + 底部 tabbar
    </lark-td>
    <lark-td>
      mobileTabbar 正常显示，布局无崩坏
    </lark-td>
    <lark-td>
      🖐️
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      UI 方案 §5.1、§7.4；架构报告 §3.4「移动端与 PWA：未验证」
    </lark-td>
  </lark-tr>
</lark-table>

**【需确认项】**
- 🔒 UI-02 导航入口完整性：需组长在验收前逐项核对原有入口与左侧导航的映射
---

### 3.2 首页（P0）
<quote-container>
**模块目标**：首页增加 Hero 区和快捷入口，强化创作召唤。
**上游证据**：UI 方案 §5.3「首页改版建议」为 P0。
</quote-container>


<lark-table rows="5" cols="7" header-row="true" column-widths="80,80,139,139,80,80,140">

  <lark-tr>
    <lark-td>
      序号
    </lark-td>
    <lark-td>
      验收项
    </lark-td>
    <lark-td>
      预期行为
    </lark-td>
    <lark-td>
      通过判定
    </lark-td>
    <lark-td>
      验证方式
    </lark-td>
    <lark-td>
      Mock 可验
    </lark-td>
    <lark-td>
      备注
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      UI-05
    </lark-td>
    <lark-td>
      首页 Hero 区
    </lark-td>
    <lark-td>
      新增 Hero 区，含文案 + "新建项目"主按钮 + 能力轮播
    </lark-td>
    <lark-td>
      Hero 区可见，主按钮可点击跳转新建项目
    </lark-td>
    <lark-td>
      👁️
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      UI 方案 P0
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      UI-06
    </lark-td>
    <lark-td>
      Hero 区不遮挡项目列表
    </lark-td>
    <lark-td>
      Hero 区下方保留「我的项目」入口，老用户可快速访问
    </lark-td>
    <lark-td>
      页面向下滚动可见项目列表和筛选栏
    </lark-td>
    <lark-td>
      🖐️
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      **质检官风险 R-P1-02**：防止老用户找不到项目列表
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      UI-07
    </lark-td>
    <lark-td>
      快捷入口卡片
    </lark-td>
    <lark-td>
      横向滚动卡片展示 6 大能力（剧本/角色/视频/配音/字幕/成片）
    </lark-td>
    <lark-td>
      卡片可横向滚动，点击跳转对应功能
    </lark-td>
    <lark-td>
      🖐️
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      UI 方案 §5.3
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      UI-08
    </lark-td>
    <lark-td>
      筛选栏精简
    </lark-td>
    <lark-td>
      从 7 个筛选器精简为 4 个（搜索+状态+风格+排序）
    </lark-td>
    <lark-td>
      筛选栏显示 ≤4 个主筛选项，其余收进「更多筛选」
    </lark-td>
    <lark-td>
      👁️
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      UI 方案 §5.3
    </lark-td>
  </lark-tr>
</lark-table>

---

### 3.3 作品广场（P1）
<quote-container>
**模块目标**：分类 tab 横向滚动，卡片增加复刻入口。
**上游证据**：UI 方案 §5.5「作品广场改版建议」为 P1。
</quote-container>


<lark-table rows="4" cols="7" header-row="true" column-widths="80,80,109,109,80,80,200">

  <lark-tr>
    <lark-td>
      序号
    </lark-td>
    <lark-td>
      验收项
    </lark-td>
    <lark-td>
      预期行为
    </lark-td>
    <lark-td>
      通过判定
    </lark-td>
    <lark-td>
      验证方式
    </lark-td>
    <lark-td>
      Mock 可验
    </lark-td>
    <lark-td>
      备注
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      UI-09
    </lark-td>
    <lark-td>
      分类 tab 横向滚动
    </lark-td>
    <lark-td>
      分类从按钮组改为横向滚动 tab
    </lark-td>
    <lark-td>
      分类 tab 支持横向滚动，切换正确过滤作品
    </lark-td>
    <lark-td>
      🖐️
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      UI 方案 P1
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      UI-10
    </lark-td>
    <lark-td>
      作品卡片复刻入口
    </lark-td>
    <lark-td>
      卡片底部暴露「复刻」按钮
    </lark-td>
    <lark-td>
      点击复刻正确创建新项目副本
    </lark-td>
    <lark-td>
      🖐️
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      UI 方案 P1
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      UI-11
    </lark-td>
    <lark-td>
      创作者等级徽章
    </lark-td>
    <lark-td>
      卡片显示创作者等级徽章（先锋/专业/荣誉）
    </lark-td>
    <lark-td>
      徽章样式正确，无等级时不显示
    </lark-td>
    <lark-td>
      👁️
    </lark-td>
    <lark-td>
      ⚠️
    </lark-td>
    <lark-td>
      UI 方案 P1；**需后端字段 user.creatorLevel**，架构报告未确认该字段已就绪
    </lark-td>
  </lark-tr>
</lark-table>

**【需确认项】**
- ❓ UI-11 创作者等级徽章：需研发工程师确认创作者等级字段是否已实现；如未实现，需确认前端是否有兜底（不显示徽章）
---

### 3.4 编辑器（P1）
<quote-container>
**模块目标**：编辑器各 tab 样式优化，提升质感。
**上游证据**：UI 方案 §5.4「创作页改版建议」为 P1。
</quote-container>


<lark-table rows="5" cols="7" header-row="true" column-widths="80,80,169,169,80,80,80">

  <lark-tr>
    <lark-td>
      序号
    </lark-td>
    <lark-td>
      验收项
    </lark-td>
    <lark-td>
      预期行为
    </lark-td>
    <lark-td>
      通过判定
    </lark-td>
    <lark-td>
      验证方式
    </lark-td>
    <lark-td>
      Mock 可验
    </lark-td>
    <lark-td>
      备注
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      UI-12
    </lark-td>
    <lark-td>
      输入框聚焦光晕
    </lark-td>
    <lark-td>
      输入框获得焦点时显示品牌色光晕边框
    </lark-td>
    <lark-td>
      CSS :focus 态生效，光晕颜色为 accent 色
    </lark-td>
    <lark-td>
      👁️
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      UI 方案 P1
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      UI-13
    </lark-td>
    <lark-td>
      按钮微交互
    </lark-td>
    <lark-td>
      按钮 hover/click 时有视觉反馈（缩放/阴影变化）
    </lark-td>
    <lark-td>
      按钮交互态可通过手动操作观察到
    </lark-td>
    <lark-td>
      👁️
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      UI 方案 P1
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      UI-14
    </lark-td>
    <lark-td>
      分镜卡片缩略图
    </lark-td>
    <lark-td>
      镜头页分镜卡片显示视频缩略图（或合理占位图）
    </lark-td>
    <lark-td>
      卡片不显示为纯空白，有缩略图或占位图
    </lark-td>
    <lark-td>
      👁️
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      UI 方案 P1
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      UI-15
    </lark-td>
    <lark-td>
      编辑器 tab 指示器
    </lark-td>
    <lark-td>
      左侧 tab 导航 active 态有清晰视觉指示
    </lark-td>
    <lark-td>
      active tab 与 inactive tab 视觉差异明显
    </lark-td>
    <lark-td>
      👁️
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      UI 方案 §5.4
    </lark-td>
  </lark-tr>
</lark-table>

---

### 3.5 主题与适配（P1）
<quote-container>
**模块目标**：暗色/亮色主题切换正常，全局样式一致。
**上游证据**：架构报告 §3.4「暗色/亮色主题：未验证（CSS 变量存在）」。
</quote-container>


<lark-table rows="3" cols="7" header-row="true" column-widths="80,83,167,168,80,80,80">

  <lark-tr>
    <lark-td>
      序号
    </lark-td>
    <lark-td>
      验收项
    </lark-td>
    <lark-td>
      预期行为
    </lark-td>
    <lark-td>
      通过判定
    </lark-td>
    <lark-td>
      验证方式
    </lark-td>
    <lark-td>
      Mock 可验
    </lark-td>
    <lark-td>
      备注
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      UI-16
    </lark-td>
    <lark-td>
      暗色/亮色主题切换
    </lark-td>
    <lark-td>
      支持一键切换主题，全页面颜色正确响应
    </lark-td>
    <lark-td>
      切换后无未覆盖区域，CSS 变量正确响应
    </lark-td>
    <lark-td>
      🖐️
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      架构报告 §3.4
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      UI-17
    </lark-td>
    <lark-td>
      主题切换无闪烁
    </lark-td>
    <lark-td>
      主题切换时页面无肉眼可见的闪烁或布局跳动
    </lark-td>
    <lark-td>
      切换过程平滑，过渡时间在 300ms 内可接受
    </lark-td>
    <lark-td>
      👁️
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      —
    </lark-td>
  </lark-tr>
</lark-table>

---

## 四、性能验收标准
### 4.1 响应时间（P0/P1）
<quote-container>
**模块目标**：mock 模式下核心操作响应时间在可接受范围内。
**上游证据**：架构报告 §4.2「单镜视频生成：12 秒内完成（mock）」；§4.1「365 测试/364 通过/1 失败，耗时约 100 秒」。
</quote-container>


<lark-table rows="6" cols="7" header-row="true" column-widths="101,80,132,132,80,80,133">

  <lark-tr>
    <lark-td>
      序号
    </lark-td>
    <lark-td>
      验收项
    </lark-td>
    <lark-td>
      预期行为
    </lark-td>
    <lark-td>
      通过判定
    </lark-td>
    <lark-td>
      验证方式
    </lark-td>
    <lark-td>
      Mock 可验
    </lark-td>
    <lark-td>
      备注
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      PERF-01
    </lark-td>
    <lark-td>
      单镜视频生成耗时
    </lark-td>
    <lark-td>
      mock 模式下单镜生成完成时间 ≤ 15 秒
    </lark-td>
    <lark-td>
      从请求到状态变为 completed ≤ 15s
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      架构报告 §4.2 实测 12 秒，标准留 15 秒余量
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      PERF-02
    </lark-td>
    <lark-td>
      剧本生成耗时
    </lark-td>
    <lark-td>
      mock 模式下剧本生成完成时间 ≤ 10 秒
    </lark-td>
    <lark-td>
      从请求到返回分镜列表 ≤ 10s
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      —
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      PERF-03
    </lark-td>
    <lark-td>
      视频合成导出耗时
    </lark-td>
    <lark-td>
      有完成镜头时导出耗时 ≤ 30 秒
    </lark-td>
    <lark-td>
      从请求到 MP4 文件生成 ≤ 30s
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      需视镜头数量和时长调整预期
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      PERF-04
    </lark-td>
    <lark-td>
      页面首屏加载
    </lark-td>
    <lark-td>
      首页首屏加载时间 ≤ 3 秒（本地网络）
    </lark-td>
    <lark-td>
      Lighthouse 或 DevTools 测量首屏时间 ≤ 3s
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      —
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      PERF-05
    </lark-td>
    <lark-td>
      API 响应基线
    </lark-td>
    <lark-td>
      非生成类 API（CRUD/查询）响应时间 ≤ 500ms
    </lark-td>
    <lark-td>
      95% 请求响应时间 ≤ 500ms
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      —
    </lark-td>
  </lark-tr>
</lark-table>

**【需确认项】**
- ❓ PERF-03 导出耗时：需研发工程师确认导出耗时的预期值（与镜头数量、视频时长相关）
---

### 4.2 资源占用（P1）
<quote-container>
**模块目标**：ffmpeg 处理不导致 OOM，磁盘使用可控。
**上游证据**：架构报告 §6.3「ffmpeg 资源消耗导致 OOM：中风险」；质检官风险 R-P0-04。
</quote-container>


<lark-table rows="4" cols="7" header-row="true" column-widths="101,80,252,80,80,80,93">

  <lark-tr>
    <lark-td>
      序号
    </lark-td>
    <lark-td>
      验收项
    </lark-td>
    <lark-td>
      预期行为
    </lark-td>
    <lark-td>
      通过判定
    </lark-td>
    <lark-td>
      验证方式
    </lark-td>
    <lark-td>
      Mock 可验
    </lark-td>
    <lark-td>
      备注
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      PERF-06
    </lark-td>
    <lark-td>
      内存占用
    </lark-td>
    <lark-td>
      导出 5 分钟以内成片时，Node 进程内存 ≤ 1GB
    </lark-td>
    <lark-td>
      监控导出过程中的 RSS 内存峰值
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      架构报告 §6.3；需研发确认内存限制策略
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      PERF-07
    </lark-td>
    <lark-td>
      并发生成限制
    </lark-td>
    <lark-td>
      视频生成并发数不超过 VIDEO_MAX_CONCURRENT 配置
    </lark-td>
    <lark-td>
      超过并发限制时新任务进入队列等待
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      架构报告 §2.1「批量镜头生成」
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      PERF-08
    </lark-td>
    <lark-td>
      磁盘空间预警
    </lark-td>
    <lark-td>
      磁盘空间不足时生成/导出有友好错误提示
    </lark-td>
    <lark-td>
      错误提示包含「磁盘空间不足」或类似文案
    </lark-td>
    <lark-td>
      🖐️
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      **质检官风险 R-P0-03**
    </lark-td>
  </lark-tr>
</lark-table>

**【需确认项】**
- ❓ PERF-06 内存上限：需研发工程师确认当前 Node 进程内存预期占用和限制策略
---

### 4.3 测试通过率（P0）
<quote-container>
**模块目标**：测试套件保持高通过率。
**上游证据**：架构报告 §4.1「364 pass / 1 fail / 0 skip」。
</quote-container>


<lark-table rows="3" cols="7" header-row="true" column-widths="101,83,131,131,80,80,132">

  <lark-tr>
    <lark-td>
      序号
    </lark-td>
    <lark-td>
      验收项
    </lark-td>
    <lark-td>
      预期行为
    </lark-td>
    <lark-td>
      通过判定
    </lark-td>
    <lark-td>
      验证方式
    </lark-td>
    <lark-td>
      Mock 可验
    </lark-td>
    <lark-td>
      备注
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      PERF-09
    </lark-td>
    <lark-td>
      测试通过率
    </lark-td>
    <lark-td>
      测试套件通过率 ≥ 99%
    </lark-td>
    <lark-td>
      失败测试数 ≤ 1（允许标题卡字体缺失测试失败）
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      架构报告 §4.1；新增测试失败需逐条审查
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      PERF-10
    </lark-td>
    <lark-td>
      无新增 eslint error
    </lark-td>
    <lark-td>
      新增代码不引入新的 eslint error
    </lark-td>
    <lark-td>
      eslint 扫描新增 error 数为 0
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      架构报告 §4.1「42 个历史 eslint error」为基线，不强制要求全修复
    </lark-td>
  </lark-tr>
</lark-table>

---

## 五、安全验收标准
### 5.1 输入安全（P0）
<quote-container>
**模块目标**：用户输入不导致 XSS、路径遍历等安全问题。
**上游证据**：质检官风险 R-P2-01「安全与输入校验」。
</quote-container>


<lark-table rows="5" cols="7" header-row="true" column-widths="89,86,165,145,80,80,93">

  <lark-tr>
    <lark-td>
      序号
    </lark-td>
    <lark-td>
      验收项
    </lark-td>
    <lark-td>
      预期行为
    </lark-td>
    <lark-td>
      通过判定
    </lark-td>
    <lark-td>
      验证方式
    </lark-td>
    <lark-td>
      Mock 可验
    </lark-td>
    <lark-td>
      备注
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      SEC-01
    </lark-td>
    <lark-td>
      XSS 防护 — 项目名称
    </lark-td>
    <lark-td>
      输入 `<script>alert(1)</script>` 作为项目名称，渲染时转义
    </lark-td>
    <lark-td>
      页面不执行脚本，以纯文本显示输入内容
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      **质检官风险 R-P2-01**
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      SEC-02
    </lark-td>
    <lark-td>
      XSS 防护 — 剧本内容
    </lark-td>
    <lark-td>
      在剧本中注入 HTML/JS payload，渲染时转义
    </lark-td>
    <lark-td>
      页面不执行脚本，以纯文本或安全格式显示
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      **质检官风险 R-P2-01**
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      SEC-03
    </lark-td>
    <lark-td>
      路径遍历防护
    </lark-td>
    <lark-td>
      请求视频/导出文件时使用 `../../../etc/passwd` 等路径
    </lark-td>
    <lark-td>
      返回 404 或 403，不暴露服务器文件
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      **质检官风险 R-P2-01**
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      SEC-04
    </lark-td>
    <lark-td>
      大文件上传限制
    </lark-td>
    <lark-td>
      上传 50MB+ JSON/图片时，有大小限制和错误提示
    </lark-td>
    <lark-td>
      请求被拦截，返回 413 或友好错误信息
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      **质检官风险 R-P2-01**
    </lark-td>
  </lark-tr>
</lark-table>

---

### 5.2 认证安全（P1）
<quote-container>
**模块目标**：认证机制不被轻易绕过。
**上游证据**：质检官风险 R-P1-01「用户认证与权限」。
</quote-container>


<lark-table rows="3" cols="7" header-row="true" column-widths="89,80,158,158,80,80,93">

  <lark-tr>
    <lark-td>
      序号
    </lark-td>
    <lark-td>
      验收项
    </lark-td>
    <lark-td>
      预期行为
    </lark-td>
    <lark-td>
      通过判定
    </lark-td>
    <lark-td>
      验证方式
    </lark-td>
    <lark-td>
      Mock 可验
    </lark-td>
    <lark-td>
      备注
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      SEC-05
    </lark-td>
    <lark-td>
      未登录访问控制
    </lark-td>
    <lark-td>
      清除 Token 后访问需鉴权的数据修改接口
    </lark-td>
    <lark-td>
      返回 401/403，操作不被执行
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      **质检官风险 R-P1-01**
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      SEC-06
    </lark-td>
    <lark-td>
      敏感信息不泄露
    </lark-td>
    <lark-td>
      错误响应和日志中不包含 JWT Secret、密码哈希等
    </lark-td>
    <lark-td>
      检查错误响应体和日志输出，无敏感字段
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      **质检官风险 R-P2-01**
    </lark-td>
  </lark-tr>
</lark-table>

---

## 六、部署验收标准
### 6.1 容器化部署（P0）
<quote-container>
**模块目标**：Docker 容器可正常运行，健康检查有效。
**上游证据**：架构报告 §6.1「单机 Docker：✅ 高可行性」、§6.2「阶段一：Docker Compose 单机部署」。
</quote-container>


<lark-table rows="6" cols="7" header-row="true" column-widths="89,94,152,155,80,80,119">

  <lark-tr>
    <lark-td>
      序号
    </lark-td>
    <lark-td>
      验收项
    </lark-td>
    <lark-td>
      预期行为
    </lark-td>
    <lark-td>
      通过判定
    </lark-td>
    <lark-td>
      验证方式
    </lark-td>
    <lark-td>
      Mock 可验
    </lark-td>
    <lark-td>
      备注
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      DEP-01
    </lark-td>
    <lark-td>
      Docker 构建
    </lark-td>
    <lark-td>
      `docker build` 成功，无致命错误
    </lark-td>
    <lark-td>
      镜像构建完成，可正常启动容器
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      架构报告 §6.1
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      DEP-02
    </lark-td>
    <lark-td>
      Docker Compose 启动
    </lark-td>
    <lark-td>
      `docker-compose up` 后服务正常启动
    </lark-td>
    <lark-td>
      http://localhost:3000/health 返回 ok
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      架构报告 §4.2「启动服务器：✅ 成功」
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      DEP-03
    </lark-td>
    <lark-td>
      健康检查
    </lark-td>
    <lark-td>
      /health 端点返回 200 + ok
    </lark-td>
    <lark-td>
      容器启动后 5 秒内 /health 可访问
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      架构报告 §4.3「GET /health：✅ 200」
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      DEP-04
    </lark-td>
    <lark-td>
      容器内 ffmpeg 可用
    </lark-td>
    <lark-td>
      Docker 容器内 ffmpeg 版本正确，可执行
    </lark-td>
    <lark-td>
      `ffmpeg -version` 在容器内返回版本信息
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      **质检官风险 R-P0-04**
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      DEP-05
    </lark-td>
    <lark-td>
      容器内中文字体
    </lark-td>
    <lark-td>
      标题卡和字幕渲染时中文正常显示
    </lark-td>
    <lark-td>
      片头生成和字幕导出中文字符不为方框
    </lark-td>
    <lark-td>
      🖐️
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      **质检官风险 R-P0-04**：架构报告 §4.1 已发现字体缺失问题
    </lark-td>
  </lark-tr>
</lark-table>

---

### 6.2 核心链路可跑通（P0）
<quote-container>
**模块目标**：部署后可完成「创建项目 → 生成剧本 → 生成镜头 → 合成导出」的完整流程。
**上游证据**：架构报告 §4.2「本地 E2E 验证结果」确认链路可跑通。
</quote-container>


<lark-table rows="4" cols="7" header-row="true" column-widths="89,80,152,153,80,80,104">

  <lark-tr>
    <lark-td>
      序号
    </lark-td>
    <lark-td>
      验收项
    </lark-td>
    <lark-td>
      预期行为
    </lark-td>
    <lark-td>
      通过判定
    </lark-td>
    <lark-td>
      验证方式
    </lark-td>
    <lark-td>
      Mock 可验
    </lark-td>
    <lark-td>
      备注
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      DEP-06
    </lark-td>
    <lark-td>
      部署后核心链路 E2E
    </lark-td>
    <lark-td>
      在部署环境中完成完整创作流程
    </lark-td>
    <lark-td>
      从创建项目到导出 MP4 全程无阻断
    </lark-td>
    <lark-td>
      🖐️
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      架构报告 §4.2 E2E 验证
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      DEP-07
    </lark-td>
    <lark-td>
      URL 可公开访问
    </lark-td>
    <lark-td>
      部署后的服务可通过公网 URL 访问
    </lark-td>
    <lark-td>
      浏览器可直接访问首页和 API
    </lark-td>
    <lark-td>
      🖐️
    </lark-td>
    <lark-td>
      ⚠️
    </lark-td>
    <lark-td>
      需在具体部署环境验证
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      DEP-08
    </lark-td>
    <lark-td>
      前端资源加载
    </lark-td>
    <lark-td>
      首页 JS/CSS/图片资源正常加载，无 404
    </lark-td>
    <lark-td>
      DevTools Network 面板无主要资源 404
    </lark-td>
    <lark-td>
      🖐️
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      —
    </lark-td>
  </lark-tr>
</lark-table>

---

### 6.3 可观测性（P1）
<quote-container>
**模块目标**：基本日志和健康监控可用。
**上游证据**：架构报告 §5.2「无日志聚合与监控」为 P2 差距；质检官风险 R-P2-03「无结构化日志」。
</quote-container>


<lark-table rows="3" cols="7" header-row="true" column-widths="89,158,158,170,80,80,176">

  <lark-tr>
    <lark-td>
      序号
    </lark-td>
    <lark-td>
      验收项
    </lark-td>
    <lark-td>
      预期行为
    </lark-td>
    <lark-td>
      通过判定
    </lark-td>
    <lark-td>
      验证方式
    </lark-td>
    <lark-td>
      Mock 可验
    </lark-td>
    <lark-td>
      备注
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      DEP-09
    </lark-td>
    <lark-td>
      错误日志输出
    </lark-td>
    <lark-td>
      发生错误时有日志输出到控制台/文件
    </lark-td>
    <lark-td>
      可查阅到包含错误堆栈或信息的日志
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      —
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      DEP-10
    </lark-td>
    <lark-td>
      Docker HEALTHCHECK
    </lark-td>
    <lark-td>
      Dockerfile 中 HEALTHCHECK 指令正常工作
    </lark-td>
    <lark-td>
      容器异常时自动重启（restart: unless-stopped）
    </lark-td>
    <lark-td>
      🧪
    </lark-td>
    <lark-td>
      ✅
    </lark-td>
    <lark-td>
      架构报告 §6.3「Docker 已配置 HEALTHCHECK」
    </lark-td>
  </lark-tr>
</lark-table>

---

## 七、不可在 Mock 模式下验证的项（清单）
以下验收项**明确无法在 mock 模式下完成验证**，需在真实 API Key 就绪后另行安排验收轮次。

<lark-table rows="9" cols="5" header-row="true" column-widths="101,216,125,216,80">

  <lark-tr>
    <lark-td>
      序号
    </lark-td>
    <lark-td>
      验收项
    </lark-td>
    <lark-td>
      所属模块
    </lark-td>
    <lark-td>
      解锁条件
    </lark-td>
    <lark-td>
      优先级
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      REAL-01
    </lark-td>
    <lark-td>
      真实视频生成质量
    </lark-td>
    <lark-td>
      核心创作链路
    </lark-td>
    <lark-td>
      接入 Runway/Pika/Minimax 并配置 API Key
    </lark-td>
    <lark-td>
      P0
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      REAL-02
    </lark-td>
    <lark-td>
      真实剧本生成质量
    </lark-td>
    <lark-td>
      核心创作链路
    </lark-td>
    <lark-td>
      接入 OpenAI/Claude 并配置 API Key
    </lark-td>
    <lark-td>
      P0
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      REAL-03
    </lark-td>
    <lark-td>
      真实配音音质
    </lark-td>
    <lark-td>
      核心创作链路
    </lark-td>
    <lark-td>
      接入 ElevenLabs 并配置 API Key
    </lark-td>
    <lark-td>
      P0
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      REAL-04
    </lark-td>
    <lark-td>
      镜头衔接效果
    </lark-td>
    <lark-td>
      核心创作链路
    </lark-td>
    <lark-td>
      真实视频生成后人工评估相邻镜头连贯性
    </lark-td>
    <lark-td>
      P1
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      REAL-05
    </lark-td>
    <lark-td>
      角色一致性评分
    </lark-td>
    <lark-td>
      核心创作链路
    </lark-td>
    <lark-td>
      真实视频生成后评估角色视觉一致性
    </lark-td>
    <lark-td>
      P1
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      REAL-06
    </lark-td>
    <lark-td>
      多厂商 Provider 切换一致性
    </lark-td>
    <lark-td>
      平台能力
    </lark-td>
    <lark-td>
      逐个接入真实 Provider 验证返回格式
    </lark-td>
    <lark-td>
      P1
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      REAL-07
    </lark-td>
    <lark-td>
      支付流程端到端
    </lark-td>
    <lark-td>
      商业化
    </lark-td>
    <lark-td>
      接入 Stripe 或国内支付渠道完成真实支付
    </lark-td>
    <lark-td>
      P1
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      REAL-08
    </lark-td>
    <lark-td>
      部署环境并发压力
    </lark-td>
    <lark-td>
      部署
    </lark-td>
    <lark-td>
      生产流量或压测工具验证
    </lark-td>
    <lark-td>
      P2
    </lark-td>
  </lark-tr>
</lark-table>

---

## 八、需研发工程师补充说明的项

<lark-table rows="6" cols="4" header-row="true" column-widths="89,101,274,274">

  <lark-tr>
    <lark-td>
      序号
    </lark-td>
    <lark-td>
      关联验收项
    </lark-td>
    <lark-td>
      问题描述
    </lark-td>
    <lark-td>
      补充说明用途
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      SUP-01
    </lark-td>
    <lark-td>
      F-06
    </lark-td>
    <lark-td>
      服务重启后异步生成任务的状态恢复机制是什么？
    </lark-td>
    <lark-td>
      确认状态恢复或失败标记的实现方式
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      SUP-02
    </lark-td>
    <lark-td>
      F-19
    </lark-td>
    <lark-td>
      当前是否已实现多用户数据隔离？default 用户与 JWT 用户的数据是否分离？
    </lark-td>
    <lark-td>
      确认认证相关数据隔离现状
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      SUP-03
    </lark-td>
    <lark-td>
      PERF-03
    </lark-td>
    <lark-td>
      视频合成导出的预期耗时与镜头数量/时长的关系是什么？
    </lark-td>
    <lark-td>
      设定合理的性能验收阈值
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      SUP-04
    </lark-td>
    <lark-td>
      PERF-06
    </lark-td>
    <lark-td>
      Node 进程在导出过程中的预期内存占用峰值是多少？是否有内存限制策略？
    </lark-td>
    <lark-td>
      设定合理的资源占用阈值
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      SUP-05
    </lark-td>
    <lark-td>
      UI-11
    </lark-td>
    <lark-td>
      创作者等级字段 user.creatorLevel 是否已实现？如未实现，前端兜底策略是什么？
    </lark-td>
    <lark-td>
      确认 P1 UI 功能的数据依赖状态
    </lark-td>
  </lark-tr>
</lark-table>

---

## 九、需组长最终确认的项

<lark-table rows="5" cols="4" header-row="true" column-widths="89,180,270,199">

  <lark-tr>
    <lark-td>
      序号
    </lark-td>
    <lark-td>
      关联验收项
    </lark-td>
    <lark-td>
      确认内容
    </lark-td>
    <lark-td>
      确认时机
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      CON-01
    </lark-td>
    <lark-td>
      F-04
    </lark-td>
    <lark-td>
      shotId 不一致问题是否已修复？如未修复，是否接受「通过项目详情获取 shotId」作为规避方案？
    </lark-td>
    <lark-td>
      研发完成后验收前
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      CON-02
    </lark-td>
    <lark-td>
      UI-02
    </lark-td>
    <lark-td>
      左侧导航实现后，是否已逐项核对所有原有功能入口均可访问？
    </lark-td>
    <lark-td>
      UI 改版完成后验收前
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      CON-03
    </lark-td>
    <lark-td>
      REAL-01~REAL-08
    </lark-td>
    <lark-td>
      是否接受「mock 模式验收通过即可发布 MVP，真实 API 验证延后」？
    </lark-td>
    <lark-td>
      MVP 发布决策时
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      CON-04
    </lark-td>
    <lark-td>
      全部 P0 项
    </lark-td>
    <lark-td>
      P0 验收项是否全部通过？任一项不通过是否坚持阻断上线？
    </lark-td>
    <lark-td>
      验收完成后发布前
    </lark-td>
  </lark-tr>
</lark-table>

---

## 十、验收执行流程建议
### 10.1 验收轮次

<lark-table rows="4" cols="4" header-row="true" column-widths="80,165,328,165">

  <lark-tr>
    <lark-td>
      轮次
    </lark-td>
    <lark-td>
      目标
    </lark-td>
    <lark-td>
      覆盖范围
    </lark-td>
    <lark-td>
      执行人建议
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      第一轮
    </lark-td>
    <lark-td>
      P0 核心链路验证
    </lark-td>
    <lark-td>
      F-01~~F-15、UI-01~~UI-08、PERF-01~~PERF-05、SEC-01~~SEC-04、DEP-01~DEP-08
    </lark-td>
    <lark-td>
      研发工程师自测 + 组长抽检
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      第二轮
    </lark-td>
    <lark-td>
      P1 功能与 UI 验证
    </lark-td>
    <lark-td>
      F-16~~F-32、UI-09~~UI-17、PERF-06~~PERF-10、SEC-05~~SEC-06、DEP-09~DEP-10
    </lark-td>
    <lark-td>
      组长主导验收
    </lark-td>
  </lark-tr>
  <lark-tr>
    <lark-td>
      第三轮
    </lark-td>
    <lark-td>
      真实 API 验证（延后）
    </lark-td>
    <lark-td>
      REAL-01~REAL-08
    </lark-td>
    <lark-td>
      真实 API Key 就绪后执行
    </lark-td>
  </lark-tr>
</lark-table>

### 10.2 阻塞上线的硬性条件（P0）
以下任一项不通过，MVP 不得发布：
1. 核心链路 E2E 不通过：创建项目 → 生成剧本 → 生成单镜 → 合成导出
1. shotId 不一致问题未修复且无规避文档
1. XSS 输入未转义（存在可复现的存储型 XSS）
1. 磁盘满/写入失败无友好错误提示
1. UI 改版导致原有功能入口丢失
1. 移动端布局崩坏（无法正常使用）
1. Docker 构建失败或容器无法启动
---

<quote-container>
**文档版本**：v1.0
**制定日期**：2026-10-04
**制定人**：研发小组长
**上游依据**：架构报告（Od0NdYsLaolUexxi5n6cGaKTnkg）、UI 方案（GsxZdV4XRoeyqlxTvvIcE4ounnd）、质检官风险用例（HVEmdoTRAoMwMbxipWdcDUBMnig）
</quote-container>

<!-- Unsupported block type: 999 -->
