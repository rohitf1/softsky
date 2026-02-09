import { apiRequest } from '../api/httpClient'

export const createShare = async (snapshot) =>
  apiRequest('/shares', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(snapshot)
  })

export const fetchShareById = async (shareId) => apiRequest(`/shares/${encodeURIComponent(shareId)}`)

export const fetchShareStats = async (shareId) => apiRequest(`/shares/${encodeURIComponent(shareId)}/stats`)

export const createShareJob = async (snapshot) =>
  apiRequest('/jobs', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(snapshot)
  })

export const fetchShareJob = async (jobId) => apiRequest(`/jobs/${encodeURIComponent(jobId)}`)

