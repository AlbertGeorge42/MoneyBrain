import type { Request, RequestHandler } from 'express'

type RequestValidator = (req: Request) => void | Promise<void>

export const validateRequest = (validator: RequestValidator): RequestHandler => {
  return async (req, _res, next) => {
    try {
      await validator(req)
      next()
    } catch (err) {
      next(err)
    }
  }
}