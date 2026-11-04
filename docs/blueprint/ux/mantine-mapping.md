# Mantine 映射表（U13 执行时查阅）

> 仅 U13 执行时查阅，不是迁移计划。迁移计划、顺序与验收在 [stage-1-experience.md](../stage-1-experience.md) U13.1–U13.5。
> 执行日以代码实测为准；这里的计数是 2026-11-04 基线。

## A · 41 个组件符号

**通用约定**：主按钮 `variant="filled"`、次按钮 `variant="default"`（移动 44 / PC 36）；
业务组件禁止读 `theme.colors` 猜语义，只读 `theme.other` 与 `--mb-*`；自建落法统一走 `ui/`。

**组件（41 个，括号内为用量）**：`Button(29)→Button/ActionIcon`、`Card(19)→Paper + ui/SurfaceCard`、
`Empty(16)→自建 EmptyState`、`Tag(14)→Badge + ui/TypeBadge`、`Typography(13)→Text/Title`、
`Form(13)→useForm`、`Modal(13)→Modal + ui/ResponsiveOverlay`、`Space(10)→Group/Stack`、
`Input(9)→TextInput/Textarea`、`Skeleton(8)→Skeleton + ui/LoadingBlock`、`Grid(8)→SimpleGrid`、
`Statistic(6)→自建 Metric/KpiCard`、`Alert(6)→Alert`、`Segmented(6)→Segmented`、
`TreeSelect(5)→自建 TreeSelect`、`Table(5)→Table/自建 DataTable`、
`InputNumber(5)→NumberInput + ui/CurrencyInput`、`DatePicker(5)→DatePickerInput/自建 TimePanel`、
`Tabs(4)→Tabs`、`App(4)→删除（useNotify 接 notifications）`、`Divider(4)→Divider`、
`Select(3)→Select/Combobox`、`Dropdown(3)→Menu`、`Switch(3)→Switch`、`Tooltip(3)→Tooltip`、
`Progress(3)→Progress/RingProgress`、`Spin(3)→Loader`、`Radio(2)→Radio.Group`、
`Result(2)→自建 ResultState`、`Row(2)→SimpleGrid`、`Col(2)→SimpleGrid`、`Popover(2)→Popover`、
`Drawer(2)→Drawer + ui/Sheet`、`Checkbox(2)→Checkbox`、`Layout(1)→删除（CSS grid + Paper + NavLink）`、
`Collapse(1)→Collapse/Accordion`、`Menu(1)→NavLink`、`ConfigProvider(1)→MantineProvider`、
`Popconfirm(1)→自建 ConfirmDialog`、`List(1)→List/Stack`、`Upload(1)→dropzone + ui/UploadBox`。

**`theme` API（35 文件）**：删除 `theme.useToken()`；间距/圆角读 `theme.other` 或 CSS 变量，
颜色读 `theme.other.financial / chart / cover`。

**6 个类型名**：`MenuProps→Mantine MenuProps`、`FormInstance→UseFormReturn`、
`TreeSelectProps→自建 TreeSelectProps`、`ThemeConfig→MantineThemeOverride`、
`InputRef→React.ComponentRef<typeof TextInput>`、`TabsProps→Mantine TabsProps`。

## B · 39 个图标（35 个 1:1 + 4 个语义重选）

**1:1 直换（35 个 / 85 处）**：

- `SettingOutlined→Settings`、`PlusOutlined→Plus`、`RightOutlined→ChevronRight`、
  `DeleteOutlined→Trash2`、`EditOutlined→Pencil`、`LeftOutlined→ChevronLeft`、
  `TransactionOutlined→ReceiptText`、`ExclamationCircleOutlined→CircleAlert`、
  `DashboardOutlined→LayoutDashboard`、`ArrowUpOutlined→ArrowUp`、`HistoryOutlined→History`、
  `RollbackOutlined→Undo2`
- `BarChartOutlined→ChartColumn`、`ControlOutlined→SlidersHorizontal`、`SwapOutlined→ArrowLeftRight`、
  `ArrowDownOutlined→ArrowDown`、`WalletOutlined→Wallet`、`DownOutlined→ChevronDown`、
  `ArrowLeftOutlined→ArrowLeft`、`CalendarOutlined→CalendarDays`、`DesktopOutlined→Monitor`、
  `SunOutlined→Sun`、`MoonOutlined→Moon`、`AccountBookOutlined→BookOpen`
- `MinusOutlined→Minus`、`CreditCardOutlined→CreditCard`、`InboxOutlined→Inbox`、
  `UnorderedListOutlined→List`、`DownloadOutlined→Download`、`FolderAddOutlined→FolderPlus`、
  `HolderOutlined→GripVertical`、`CheckCircleOutlined→CircleCheck`、`BankOutlined→Landmark`、
  `FileTextOutlined→FileText`、`FundOutlined→ChartLine`

**语义重选（4 个，不按字形硬套）**：`ExportOutlined→MoveRight`（「移动到…」）；
`RedoOutlined→RotateCcw`（「还原」）；`RestOutlined→ArchiveRestore`（回收站）；
`AppstoreOutlined→CloudAlert`（云同步目录警告）。

## C · Mantine 色阶（10 级）

浅色 `colors.gray`：

| 索引 | 值 | 角色 |
|---|---|---|
| 0 | `#FCFAF4` | 面板 |
| 1 | `#F5F2EA` | 页面底 |
| 2 | `#EDE9DE` | 下沉 / hover 底 |
| 3 | `#E2DCCC` | 分隔线 |
| 4 | `#C9C2AC` | 强边框 |
| 5 | `#646B5C` | 辅助文字 |
| 6 | `#59614F` | 次级文字 |
| 7 | `#20261F` | 主文字 |
| 8 | `#171B15` | 深中性 |
| 9 | `#0F1411` | 最深 |

暗色 `colors.dark`：

| 索引 | 值 | 角色 |
|---|---|---|
| 0 | `#EDE9DB` | 主文字 |
| 1 | `#C3CBBE` | 中性浅色 |
| 2 | `#A9B0A0` | 次级文字 |
| 3 | `#8D9585` | 辅助文字 |
| 4 | `#39443A` | 强边框 |
| 5 | `#27302A` | 分隔线 / hover 底 |
| 6 | `#161D17` | 面板 |
| 7 | `#0F1411` | 页面底（body 固定取此档） |
| 8 | `#0C100D` | 更深中性 |
| 9 | `#080B09` | 最深 |

品牌 `colors.brand`：`#E1EDE2 / #C7E3D4 / #9ADCB9 / #7CC9A2 / #4EA57F / #2F7C5C / #1D5C43 /
#17503A / #0F3D2C / #0A2E21`；`primaryColor: 'brand'`，`primaryShade: { light: 6, dark: 3 }`。
