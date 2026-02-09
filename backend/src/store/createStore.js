import { createGcpStore } from './gcpStore.js'
import { createLocalStore } from './localStore.js'

export const createStore = (config) => {
  if (config.driver === 'gcp') {
    return createGcpStore(config.gcp)
  }

  return createLocalStore({ dataDir: config.localDataDir })
}

