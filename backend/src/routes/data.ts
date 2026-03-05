import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { success, error } from '../utils/response'

const router = Router()
const prisma = new PrismaClient()

// 清空所有数据
router.delete('/all', async (req, res, next) => {
  try {
    // 按照外键依赖顺序删除
    // 1. 先删除预算提醒
    await prisma.budgetAlert.deleteMany()
    
    // 2. 删除预算
    await prisma.budget.deleteMany()
    
    // 3. 删除余额快照
    await prisma.balanceSnapshot.deleteMany()
    
    // 4. 删除交易记录
    await prisma.transaction.deleteMany()
    
    // 5. 删除账户
    await prisma.account.deleteMany()
    
    // 6. 删除账户分类（需要先删除子分类）
    const childCategories = await prisma.accountCategory.findMany({
      where: { parentId: { not: null } }
    })
    for (const child of childCategories) {
      await prisma.accountCategory.delete({ where: { id: child.id } })
    }
    await prisma.accountCategory.deleteMany()
    
    // 7. 删除收支分类（需要先删除子分类）
    const childCategories2 = await prisma.category.findMany({
      where: { parentId: { not: null } }
    })
    for (const child of childCategories2) {
      await prisma.category.delete({ where: { id: child.id } })
    }
    await prisma.category.deleteMany()
    
    return success(res, { message: '所有数据已清空' })
  } catch (err) {
    return next(err)
  }
})

export default router
