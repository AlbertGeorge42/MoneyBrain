/**
 * 集中管理所有 sessionStorage / localStorage 的 key 命名。
 * 避免 key 拼写分裂，新增状态时在此注册即可。
 *
 * 命名规则：moneybrain:<page>:<layer>:<name>
 *   layer: ui = 纯 UI 状态, pref = 用户偏好
 */
export const STORAGE_KEYS = {
  transactions: {
    filters: 'moneybrain:transactions:filters',
    filterExpanded: 'moneybrain:transactions:ui:filterExpanded',
    pageSize: 'moneybrain:transactions:pref:pageSize',
  },
  reports: {
    state: 'moneybrain:reports:state',
    detailExpandedKeys: 'moneybrain:reports:ui:detailExpandedKeys',
    viewActiveKey: 'moneybrain:reports:ui:viewActiveKey',
  },
} as const
