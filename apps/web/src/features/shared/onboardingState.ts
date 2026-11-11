/**
 * 引导流程的本地状态。
 *
 * 只记一件事：用户是否已经看过报表。
 * 「建账户」「记一笔」两步能直接从账本派生，不必另存；
 * 「看报表」是一次浏览行为，看过就不再提醒。
 */

const REPORTS_VISITED_KEY = 'mb-onboarding-reports-visited'

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

/** 是否已经进过报表页；读过即视为完成这一步。 */
export function readReportsVisited(): boolean {
  const store = storage()
  if (!store) return false
  try {
    return store.getItem(REPORTS_VISITED_KEY) === '1'
  } catch {
    return false
  }
}

export function markReportsVisited(): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(REPORTS_VISITED_KEY, '1')
  } catch {
    // 隐私模式 / 配额满：引导流程退化为「每次进入都提醒」，不影响记账。
  }
}
