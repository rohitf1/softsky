import crypto from 'node:crypto'

export const createShareId = (size = 12) => {
  const bytes = Math.ceil((size * 3) / 4)
  return crypto.randomBytes(bytes).toString('base64url').slice(0, size)
}

export const isValidShareId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value)

export const createJobId = (size = 14) => createShareId(size)
export const createGenerationId = (size = 14) => createShareId(size)

export const isValidJobId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{10,72}$/.test(value)
export const isValidGenerationId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{10,72}$/.test(value)
