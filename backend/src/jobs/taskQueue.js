import { CloudTasksClient } from '@google-cloud/tasks'

const asBase64 = (value) => Buffer.from(value, 'utf8').toString('base64')

export const createTaskQueueClient = (config) => {
  const queueConfig = config?.jobs?.queue
  if (!config?.jobs?.enabled || !queueConfig?.projectId || !queueConfig?.location || !queueConfig?.queueName || !queueConfig?.workerUrl) {
    return null
  }

  const client = new CloudTasksClient(queueConfig.projectId ? { projectId: queueConfig.projectId } : undefined)
  const parent = client.queuePath(queueConfig.projectId, queueConfig.location, queueConfig.queueName)

  return {
    async enqueueShareJob({ jobId, snapshot, idempotencyKey, owner, requestId }) {
      const payload = JSON.stringify({
        jobId,
        snapshot,
        idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '',
        owner: owner || null
      })

      const headers = {
        'content-type': 'application/json'
      }
      if (requestId) {
        headers['x-request-id'] = requestId
      }
      if (config.jobs.workerToken) {
        headers['x-worker-token'] = config.jobs.workerToken
      }

      const task = {
        httpRequest: {
          httpMethod: 'POST',
          url: queueConfig.workerUrl,
          headers,
          body: asBase64(payload)
        }
      }

      if (queueConfig.serviceAccountEmail) {
        task.httpRequest.oidcToken = {
          serviceAccountEmail: queueConfig.serviceAccountEmail
        }
        if (queueConfig.audience) {
          task.httpRequest.oidcToken.audience = queueConfig.audience
        }
      }

      await client.createTask({ parent, task })
    }
  }
}
