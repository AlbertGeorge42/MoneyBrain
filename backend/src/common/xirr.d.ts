declare module 'xirr' {
  interface Transaction {
    amount: number
    when: Date
  }

  interface Options {
    guess?: number
    tolerance?: number
    maxIterations?: number
  }

  function xirr(transactions: Transaction[], options?: Options): number

  export = xirr
}
