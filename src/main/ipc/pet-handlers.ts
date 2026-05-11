import { ipcMain } from 'electron'
import type { PetPosition, PetSettings, PetStatusPayload, PetManifest, LoadedPet } from '../../shared/types/pet'
import {
  beginPetPointerInteraction,
  createPetWindow,
  destroyPetWindow,
  endPetPointerInteraction,
  focusMainWindowFromPet,
  forwardStatusToPet,
  getCurrentPetStatus,
  getPetConfig,
  movePetWindow,
  persistPetSettings,
  setPetIgnoreMouseEvents,
  updatePetSettings
} from '../services/pet-window'
import {
  createCustomPet,
  deleteCustomPet,
  updateCustomPet as updateCustomPetManifest,
  listCustomPets,
  loadAssetAsDataUrl,
  type CreatePetParams
} from '../services/pet-file-manager'
import {
  validateImageFile,
  validateLottieFile,
  validatePetName
} from '../services/pet-validator'

interface IpcResponse<T = any> {
  success: boolean
  data?: T
  error?: string
}

export function registerPetHandlers(): void {
  ipcMain.handle('pet:show', () => {
    createPetWindow()
  })

  ipcMain.handle('pet:hide', () => {
    destroyPetWindow()
  })

  ipcMain.on('pet:publish-status', (_event, payload: PetStatusPayload) => {
    forwardStatusToPet(payload)
  })

  ipcMain.on('pet:set-ignore-mouse', (_event, payload: { ignore: boolean }) => {
    setPetIgnoreMouseEvents(Boolean(payload.ignore))
  })

  ipcMain.on('pet:begin-pointer-interaction', () => {
    beginPetPointerInteraction()
  })

  ipcMain.on('pet:end-pointer-interaction', () => {
    endPetPointerInteraction()
  })

  ipcMain.on('pet:move', (_event, payload: PetPosition) => {
    movePetWindow(payload)
  })

  ipcMain.handle('pet:focus-main', (_event, payload: { worktreeId: string | null }) => {
    focusMainWindowFromPet(payload.worktreeId)
  })

  ipcMain.handle('pet:get-config', () => {
    return getPetConfig()
  })

  ipcMain.handle('pet:get-current-status', () => {
    return getCurrentPetStatus()
  })

  ipcMain.on('pet:update-settings', (_event, partial: Partial<PetSettings>) => {
    updatePetSettings(partial)
    if (partial.enabled === true) {
      createPetWindow()
    } else if (partial.enabled === false) {
      destroyPetWindow()
    }
  })

  ipcMain.on('pet:mark-hatched', () => {
    persistPetSettings({ hasHatched: true })
  })

  /**
   * Create a new custom pet
   */
  ipcMain.handle(
    'pet:create-custom',
    async (
      _event,
      params: {
        name: string
        mainImageBuffer: Uint8Array
        mainImageExt: string
        lottieBuffer?: Uint8Array
        transform: 'spin' | 'bounce' | 'pulse' | 'none'
        questionColor: string
        permissionColor: string
        planReadyColor: string
        defaultSize: 'S' | 'M' | 'L'
      }
    ): Promise<IpcResponse<PetManifest>> => {
      try {
        // Validate pet name
        const nameValidation = validatePetName(params.name)
        if (!nameValidation.valid) {
          return {
            success: false,
            error: nameValidation.error
          }
        }

        // Convert Uint8Array to Buffer
        const mainImageBuffer = Buffer.from(params.mainImageBuffer)

        // Validate main image
        const imageValidation = await validateImageFile(mainImageBuffer)
        if (!imageValidation.valid) {
          return {
            success: false,
            error: imageValidation.error
          }
        }

        // Validate Lottie if provided
        let lottieBuffer: Buffer | undefined
        if (params.lottieBuffer) {
          lottieBuffer = Buffer.from(params.lottieBuffer)
          const lottieValidation = await validateLottieFile(lottieBuffer)
          if (!lottieValidation.valid) {
            return {
              success: false,
              error: lottieValidation.error
            }
          }
        }

        // Create pet
        const createParams: CreatePetParams = {
          name: params.name,
          mainImageBuffer,
          mainImageExt: params.mainImageExt,
          lottieBuffer,
          transform: params.transform,
          questionColor: params.questionColor,
          permissionColor: params.permissionColor,
          planReadyColor: params.planReadyColor,
          defaultSize: params.defaultSize
        }

        const manifest = await createCustomPet(createParams)

        return {
          success: true,
          data: manifest
        }
      } catch (error) {
        console.error('Failed to create custom pet:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  )

  /**
   * List all custom pets
   */
  ipcMain.handle('pet:list-custom', async (): Promise<IpcResponse<LoadedPet[]>> => {
    try {
      const pets = await listCustomPets()
      return {
        success: true,
        data: pets
      }
    } catch (error) {
      console.error('Failed to list custom pets:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: [] // Return empty array as fallback
      }
    }
  })

  /**
   * Delete a custom pet
   */
  ipcMain.handle(
    'pet:delete-custom',
    async (_event, petId: string): Promise<IpcResponse<void>> => {
      try {
        await deleteCustomPet(petId)
        return {
          success: true
        }
      } catch (error) {
        console.error('Failed to delete custom pet:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  )

  /**
   * Update a custom pet's manifest
   */
  ipcMain.handle(
    'pet:update-custom',
    async (_event, petId: string, updates: Partial<PetManifest>): Promise<IpcResponse<PetManifest>> => {
      try {
        const manifest = await updateCustomPetManifest(petId, updates)
        return {
          success: true,
          data: manifest
        }
      } catch (error) {
        console.error('Failed to update custom pet:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  )

  /**
   * Load an asset file as a data URL
   */
  ipcMain.handle(
    'pet:load-asset',
    async (_event, petId: string, relativePath: string): Promise<IpcResponse<string>> => {
      try {
        const dataUrl = await loadAssetAsDataUrl(petId, relativePath)
        return {
          success: true,
          data: dataUrl
        }
      } catch (error) {
        console.error('Failed to load asset:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  )
}
