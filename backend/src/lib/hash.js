import crypto from 'node:crypto'

export const sha256Hex = (value) => crypto.createHash('sha256').update(value).digest('hex')

