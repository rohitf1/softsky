import { buildGenerationPrompts } from './promptBuilder.js'
import { validateGeneratedMusicCode, validateGeneratedSceneCode } from './validateGeneratedCode.js'

const buildCorrectionPrompt = ({ basePrompt, codeType, validationError }) => `${basePrompt}

STRICT CORRECTION REQUIRED
- Previous ${codeType} output failed validation: ${validationError}
- Regenerate from scratch.
- Output ONLY raw JavaScript code.
- No markdown fences.
- Include all required exports.
`

export const createBundleGenerator = ({ geminiGenerator }) => {
  return {
    async generate({ intention, durationSeconds }) {
      const prompts = await buildGenerationPrompts({
        intention,
        durationSeconds
      })

      const generated = await geminiGenerator.generateSceneAndMusic(prompts)
      let sceneCode = generated.sceneCode
      let musicCode = generated.musicCode
      let sceneModel = generated.sceneModel
      let musicModel = generated.musicModel

      const maxRetries = 2
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        let sceneError = null
        let musicError = null

        try {
          validateGeneratedSceneCode(sceneCode)
        } catch (error) {
          sceneError = error instanceof Error ? error.message : 'Invalid scene code'
        }

        try {
          validateGeneratedMusicCode(musicCode)
        } catch (error) {
          musicError = error instanceof Error ? error.message : 'Invalid music code'
        }

        if (!sceneError && !musicError) {
          break
        }

        if (attempt === maxRetries) {
          throw new Error(sceneError || musicError || 'Generated code failed validation')
        }

        if (sceneError) {
          const retriedScene = await geminiGenerator.generateScene(
            buildCorrectionPrompt({
              basePrompt: prompts.scenePrompt,
              codeType: 'scene',
              validationError: sceneError
            })
          )
          sceneCode = retriedScene.sceneCode
          sceneModel = retriedScene.sceneModel
        }

        if (musicError) {
          const retriedMusic = await geminiGenerator.generateMusic(
            buildCorrectionPrompt({
              basePrompt: prompts.musicPrompt,
              codeType: 'music',
              validationError: musicError
            }),
            {
              preferredModel: sceneModel
            }
          )
          musicCode = retriedMusic.musicCode
          musicModel = retriedMusic.musicModel
        }
      }

      return {
        sceneCode,
        musicCode,
        prompts,
        sceneModel,
        musicModel,
        simulation: false
      }
    }
  }
}
