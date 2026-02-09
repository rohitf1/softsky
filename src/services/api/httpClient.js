const API_PREFIX = '/api/v1'

const apiBaseUrl = () => (import.meta.env.VITE_SHARE_API_BASE_URL || '').replace(/\/+$/g, '')

const buildApiUrl = (path) => `${apiBaseUrl()}${API_PREFIX}${path}`

const parseJson = async (response) => {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export class ApiError extends Error {
  constructor(message, { status = 500, code = '' } = {}) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const apiRequest = async (path, options = {}) => {
  const response = await fetch(buildApiUrl(path), {
    credentials: 'include',
    ...options
  })
  const payload = await parseJson(response)

  if (!response.ok) {
    throw new ApiError(payload?.error || 'Request failed', {
      status: response.status,
      code: payload?.code || ''
    })
  }

  return payload
}

