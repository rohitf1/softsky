import { apiRequest } from '../api/httpClient'

export const createGeneration = async (payload) =>
  apiRequest('/generations', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

export const listGenerations = async ({ limit = 30 } = {}) =>
  apiRequest(`/generations?limit=${encodeURIComponent(String(limit))}`)

export const fetchGenerationById = async (generationId) =>
  apiRequest(`/generations/${encodeURIComponent(generationId)}`)

export const updateGenerationThumbnail = async (generationId, thumbnailDataUrl) =>
  apiRequest(`/generations/${encodeURIComponent(generationId)}/thumbnail`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      thumbnailDataUrl
    })
  })
