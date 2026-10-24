# 项目规则

这是 Windows 本地浏览器钢琴应用，TypeScript + Vite。用户提供图片/PDF 给 Codex 转成 `.piano.json`，软件本地读取结构化谱，也支持 MusicXML/MIDI。6/Y/G/B 及左侧为左手，其右侧为右手，两手独立推进。

## 项目技能

2026-10-24 核对当前会话全部技能目录及本机 `.codex/skills`（含 `.system`）、`.agents/skills` 的元数据；项目初始为空，没有项目内技能。采用本机可运行项目，不注册或发布网站。
开始相应工作前读取技能，用户新要求优先。

| 技能 | 触发 | 用途 | 路径 |
| --- | --- | --- | --- |
| project-workbook | 修改前与收尾 | 活动工作登记 | C:/Users/jacky/.codex/skills/project-workbook/SKILL.md |
| decoupling-check | 功能设计及完成 | 音符模型、演奏引擎、音频和视图边界 | C:/Users/jacky/.codex/skills/decoupling-check/SKILL.md |
| ios-hig-design | UI | 清晰层级、可访问操作；不用 iOS API | C:/Users/jacky/.codex/skills/ios-hig-design/SKILL.md |
| avoid-ai-design | UI | 乐器式工作台，克制装饰 | C:/Users/jacky/.agents/skills/avoid-ai-design/SKILL.md |
| verification-before-completion | 交付前 | 行为测试与浏览器检查分别记录 | C:/Users/jacky/.codex/skills/verification-before-completion/SKILL.md |
| maintaining-handoff-docs | 实质开发后 | 运行命令和实际验收记录 | C:/Users/jacky/.codex/skills/maintaining-handoff-docs/SKILL.md |
| systematic-debugging | 缺陷/测试失败 | 先找根因再修复 | C:/Users/jacky/.codex/skills/systematic-debugging/SKILL.md |

## 解耦约定
- `score` 定义验证后的曲谱与导入；不依赖 DOM/音频/演奏状态。
- `performance` 拥有两手游标及同手按键合并规则，返回只读演奏事件；时钟可注入。
- `audio` 独立拥有 Web Audio 节点、静音和释放；可视化故障不阻止推进。
- `view` 仅消费谱与引擎快照；组合入口负责文件读取、键盘、动画与生命周期。
- 重置、暂停、切谱、失焦清除排队输入、动画与声音；禁止异步加载旧谱覆盖新谱。
- 测试覆盖同手合并、跨手独立、长按过滤、时值速度比例、导入校验；交付前检查依赖方向和清理路径。
