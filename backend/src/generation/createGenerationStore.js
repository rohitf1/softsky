import { createGcpGenerationStore } from './gcpGenerationStore.js'
import { createLocalGenerationStore } from './localGenerationStore.js'

export const createGenerationStore = (config) => {
  if (config.driver === 'gcp') {
    return createGcpGenerationStore(config.gcp)
  }

  return createLocalGenerationStore({ dataDir: config.localDataDir })
}

