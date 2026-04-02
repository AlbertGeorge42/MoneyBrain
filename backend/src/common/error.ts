export class AppError extends Error {
  constructor(
    public message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource}不存在`, 'NOT_FOUND', 404)
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400)
    this.name = 'ValidationError'
  }
}

export class BusinessError extends AppError {
  constructor(message: string) {
    super(message, 'BUSINESS_ERROR', 400)
    this.name = 'BusinessError'
  }
}

export class InsufficientBalanceError extends AppError {
  constructor(accountName?: string) {
    super(
      accountName ? `${accountName}余额不足` : '账户余额不足',
      'INSUFFICIENT_BALANCE',
      400
    )
    this.name = 'InsufficientBalanceError'
  }
}

export class DuplicateError extends AppError {
  constructor(resource: string, field?: string) {
    super(
      field ? `${resource}的${field}已存在` : `${resource}已存在`,
      'DUPLICATE_ERROR',
      409
    )
    this.name = 'DuplicateError'
  }
}

export class ForeignKeyError extends AppError {
  constructor(resource: string) {
    super(`关联的${resource}不存在`, 'FOREIGN_KEY_ERROR', 400)
    this.name = 'ForeignKeyError'
  }
}
