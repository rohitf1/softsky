import crypto from 'node:crypto'

const REQUEST_ID_HEADER = 'x-request-id'
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,128}$/

const createRequestId = () => crypto.randomBytes(9).toString('base64url')

export const requestContextMiddleware = () => (request, response, next) => {
  const incoming = request.get(REQUEST_ID_HEADER)
  const requestId = REQUEST_ID_RE.test(incoming || '') ? incoming : createRequestId()
  const startedAtMs = Date.now()

  request.requestId = requestId
  request.startedAtMs = startedAtMs
  response.setHeader(REQUEST_ID_HEADER, requestId)

  response.on('finish', () => {
    const durationMs = Date.now() - startedAtMs
    const message = {
      level: response.statusCode >= 500 ? 'error' : 'info',
      event: 'request.completed',
      requestId,
      method: request.method,
      path: request.originalUrl || request.url,
      statusCode: response.statusCode,
      durationMs,
      ip: request.ip || request.socket?.remoteAddress || ''
    }

    if (response.statusCode >= 500) {
      console.error(JSON.stringify(message))
    } else {
      console.log(JSON.stringify(message))
    }
  })

  next()
}

