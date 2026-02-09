import { Graphics } from 'pixi.js'

export const createLayer = (app) => {
  const layer = new Graphics()
  app.stage.addChild(layer)
  return layer
}
