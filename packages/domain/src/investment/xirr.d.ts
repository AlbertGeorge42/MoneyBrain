/** xirr@1.1.0 是 CJS（module.exports = xirr）；ESM 默认导入拿到的是同一个函数。 */
declare module 'xirr' {
  interface XirrTransaction {
    amount: number
    when: Date
  }

  interface XirrOptions {
    guess?: number
    tolerance?: number
    maxIterations?: number
  }

  function xirr(transactions: XirrTransaction[], options?: XirrOptions): number

  export default xirr
}
