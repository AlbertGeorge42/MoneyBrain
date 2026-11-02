import { Router } from 'express'
import { asyncHandler, success, validateRequest, validateIdParam } from '../common/index.js'
import { undoAuditEvent } from '../services/audit-event.service.js'

// 审计事件（B2-3）：撤销 = 依据审计事件里的 before 快照反向写入。
// 删除后的「撤销」提示条与回收站的「恢复」都走这一个端点。

const router = Router()

router.post('/:id/undo', validateRequest(validateIdParam), asyncHandler(async (req, res) => {
  const transaction = await undoAuditEvent(req.params.id)
  return success(res, transaction)
}))

export default router
