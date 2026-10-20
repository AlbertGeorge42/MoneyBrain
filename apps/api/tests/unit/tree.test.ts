import { describe, it, expect } from 'vitest'
import { buildTree } from '../../src/common/tree.js'

describe('buildTree', () => {
  it('应该将扁平数组构建为树形结构', () => {
    const items = [
      { id: '1', parentId: null, name: '根节点1' },
      { id: '2', parentId: null, name: '根节点2' },
      { id: '3', parentId: '1', name: '子节点1-1' },
      { id: '4', parentId: '1', name: '子节点1-2' },
      { id: '5', parentId: '3', name: '孙节点1-1-1' },
    ]

    const tree = buildTree(items)

    expect(tree).toHaveLength(2)
    expect(tree[0].id).toBe('1')
    expect(tree[0].children).toHaveLength(2)
    expect(tree[0].children[0].id).toBe('3')
    expect(tree[0].children[0].children).toHaveLength(1)
    expect(tree[0].children[0].children[0].id).toBe('5')
    expect(tree[1].id).toBe('2')
    expect(tree[1].children).toHaveLength(0)
  })

  it('空数组应该返回空数组', () => {
    const tree = buildTree([])
    expect(tree).toEqual([])
  })

  it('单层结构应该正确构建', () => {
    const items = [
      { id: '1', parentId: null, name: '节点1' },
      { id: '2', parentId: null, name: '节点2' },
    ]

    const tree = buildTree(items)

    expect(tree).toHaveLength(2)
    expect(tree[0].children).toHaveLength(0)
    expect(tree[1].children).toHaveLength(0)
  })

  it('指定 parentId 应该返回对应子树', () => {
    const items = [
      { id: '1', parentId: null, name: '根节点' },
      { id: '2', parentId: '1', name: '子节点1' },
      { id: '3', parentId: '1', name: '子节点2' },
      { id: '4', parentId: '2', name: '孙节点' },
    ]

    const subtree = buildTree(items, '1')

    expect(subtree).toHaveLength(2)
    expect(subtree[0].id).toBe('2')
    expect(subtree[0].children[0].id).toBe('4')
    expect(subtree[1].id).toBe('3')
  })

  it('应该保留原始对象的额外属性', () => {
    const items = [
      { id: '1', parentId: null, name: '节点1', customField: 'value1' },
    ]

    const tree = buildTree(items)

    expect(tree[0]).toHaveProperty('customField', 'value1')
  })
})
