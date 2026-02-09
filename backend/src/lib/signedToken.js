import crypto from 'node:crypto'

const toBase64Url = (value) => Buffer.from(value).toString('base64url')
const fromBase64Url = (value) => Buffer.from(value, 'base64url').toString('utf8')

const signPayload = (payloadBase64, secret) =>
  crypto.createHmac('sha256', secret).update(payloadBase64).digest('base64url')

export const createSignedToken = ({ payload, secret }) => {
  if (!secret) {
    throw new Error('Session secret is required')
  }

  const payloadJson = JSON.stringify(payload)
  const payloadBase64 = toBase64Url(payloadJson)
  const signature = signPayload(payloadBase64, secret)
  return `${payloadBase64}.${signature}`
}

export const readSignedToken = ({ token, secret }) => {
  if (!token || !secret) return null
  const [payloadBase64, signature] = token.split('.')
  if (!payloadBase64 || !signature) return null

  const expected = signPayload(payloadBase64, secret)
  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (signatureBuffer.length !== expectedBuffer.length) return null
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return null

  try {
    return JSON.parse(fromBase64Url(payloadBase64))
  } catch {
    return null
  }
}

