import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Emoji 到 Lucide 图标名称的映射
const EMOJI_TO_LUCIDE_MAP: Record<string, string> = {
  // 账户相关
  '💰': 'wallet',
  '💵': 'banknote',
  '💳': 'credit-card',
  '🏦': 'landmark',
  '💎': 'gem',
  '📱': 'smartphone',
  '💻': 'laptop',
  
  // 分类相关
  '📁': 'folder',
  '📝': 'file-text',
  '📂': 'folder-open',
  
  // 收入相关
  '💼': 'briefcase',
  '🎁': 'gift',
  '🏆': 'trophy',
  '⭐': 'star',
  '👑': 'crown',
  
  // 支出相关
  '🛒': 'shopping-cart',
  '🛍️': 'shopping-bag',
  '🍔': 'utensils',
  '☕': 'coffee',
  '🍕': 'pizza',
  '🚗': 'car',
  '🚌': 'bus',
  '🏠': 'home',
  '❤️': 'heart',
  '📚': 'book',
  '✈️': 'plane',
  '🎮': 'gamepad-2',
  '🎬': 'film',
  '🎵': 'music',
  '👕': 'shirt',
  '✂️': 'scissors',
  '🏋️': 'dumbbell',
  '💊': 'pill',
  '🎓': 'graduation-cap',
  '🌸': 'flower-2',
  '🐕': 'dog',
  '🐈': 'cat',
  '👶': 'baby',
  '☀️': 'sun',
  '☂️': 'umbrella',
  
  // 转账相关
  '🔄': 'repeat',
  '↔️': 'arrow-left-right',
  '➡️': 'arrow-right',
  '⬅️': 'arrow-left',
  '⬆️': 'arrow-up',
  '⬇️': 'arrow-down',
  '📤': 'send',
  '📥': 'download',
  
  // 其他
  '📊': 'chart-bar',
  '📈': 'trending-up',
  '📉': 'trending-down',
  '🔔': 'bell',
  '⚙️': 'settings',
  '🔒': 'lock',
  '🔓': 'unlock',
  '💡': 'lightbulb',
  '📌': 'pin',
  '🏷️': 'tag',
  '📎': 'paperclip',
  '✅': 'check',
  '❌': 'x',
  '⚠️': 'alert-triangle',
  '❓': 'help-circle',
  '💬': 'message-circle',
}

// 检测是否为Emoji
function isEmoji(str: string): boolean {
  if (!str) return false
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]/u
  return emojiRegex.test(str)
}

// 转换Emoji到Lucide图标名称
function convertEmojiToLucide(emoji: string | null): string | null {
  if (!emoji) return null
  if (!isEmoji(emoji)) return emoji // 已经是非Emoji，保持原样
  return EMOJI_TO_LUCIDE_MAP[emoji] || 'circle' // 默认使用circle图标
}

async function main() {
  console.log('开始迁移图标数据...')

  // 1. 迁移账户分类
  const accountCategories = await prisma.accountCategory.findMany()
  console.log(`找到 ${accountCategories.length} 个账户分类`)
  
  for (const cat of accountCategories) {
    if (cat.icon && isEmoji(cat.icon)) {
      const newIcon = convertEmojiToLucide(cat.icon)
      await prisma.accountCategory.update({
        where: { id: cat.id },
        data: { icon: newIcon },
      })
      console.log(`账户分类 "${cat.name}": ${cat.icon} -> ${newIcon}`)
    }
  }

  // 2. 迁移账户
  const accounts = await prisma.account.findMany()
  console.log(`找到 ${accounts.length} 个账户`)
  
  for (const acc of accounts) {
    if (acc.icon && isEmoji(acc.icon)) {
      const newIcon = convertEmojiToLucide(acc.icon)
      await prisma.account.update({
        where: { id: acc.id },
        data: { icon: newIcon },
      })
      console.log(`账户 "${acc.name}": ${acc.icon} -> ${newIcon}`)
    }
  }

  // 3. 迁移收支分类
  const categories = await prisma.transactionCategory.findMany()
  console.log(`找到 ${categories.length} 个收支分类`)
  
  for (const cat of categories) {
    if (cat.icon && isEmoji(cat.icon)) {
      const newIcon = convertEmojiToLucide(cat.icon)
      await prisma.transactionCategory.update({
        where: { id: cat.id },
        data: { icon: newIcon },
      })
      console.log(`收支分类 "${cat.name}": ${cat.icon} -> ${newIcon}`)
    }
  }

  console.log('图标数据迁移完成！')
}

main()
  .catch((e) => {
    console.error('迁移失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
