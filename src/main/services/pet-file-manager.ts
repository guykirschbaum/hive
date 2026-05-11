import fs from 'fs/promises'
import path from 'path'
import { app } from 'electron'
import type { PetManifest, PetState, LoadedPet } from '@shared/types/pet'
import { sanitizePetName } from './pet-validator'

const MAX_CUSTOM_PETS = 50

/**
 * Get the custom pets directory path
 */
export function getCustomPetsDir(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'custom-pets')
}

/**
 * Ensure the custom pets directory exists
 */
export async function ensureCustomPetsDir(): Promise<void> {
  const dir = getCustomPetsDir()
  await fs.mkdir(dir, { recursive: true })
}

/**
 * Generate a unique pet ID
 */
export async function generateUniquePetId(name: string): Promise<string> {
  const baseId = `custom-${sanitizePetName(name)}`
  const customPetsDir = getCustomPetsDir()

  // Check if base ID exists
  let id = baseId
  let counter = 2

  while (true) {
    const petDir = path.join(customPetsDir, id)
    try {
      await fs.access(petDir)
      // Directory exists, try next number
      id = `${baseId}-${counter}`
      counter++
    } catch {
      // Directory doesn't exist, this ID is available
      return id
    }
  }
}

/**
 * Create a new custom pet
 */
export interface CreatePetParams {
  name: string
  mainImageBuffer: Buffer
  mainImageExt: string // 'png' or 'webp'
  lottieBuffer?: Buffer
  transform: 'spin' | 'bounce' | 'pulse' | 'none'
  questionColor: string
  permissionColor: string
  planReadyColor: string
  defaultSize: 'S' | 'M' | 'L'
}

export async function createCustomPet(params: CreatePetParams): Promise<PetManifest> {
  // Ensure directory exists
  await ensureCustomPetsDir()

  // Check pet count limit
  const existing = await listCustomPets()
  if (existing.length >= MAX_CUSTOM_PETS) {
    throw new Error(
      `Maximum custom pets reached (${MAX_CUSTOM_PETS}). Please delete some before creating new ones`
    )
  }

  // Generate unique ID
  const id = await generateUniquePetId(params.name)
  const customPetsDir = getCustomPetsDir()
  const petDir = path.join(customPetsDir, id)
  const assetsDir = path.join(petDir, 'assets')

  // Create directories
  await fs.mkdir(assetsDir, { recursive: true })

  // Save main image
  const mainImageName = `main.${params.mainImageExt}`
  await fs.writeFile(path.join(assetsDir, mainImageName), params.mainImageBuffer)

  // Save Lottie animation if provided
  let hasLottie = false
  if (params.lottieBuffer) {
    await fs.writeFile(path.join(assetsDir, 'working.lottie'), params.lottieBuffer)
    hasLottie = true
  }

  // Generate manifest
  const manifest: PetManifest = {
    id,
    name: params.name,
    version: '1.0.0',
    author: 'Custom',
    custom: true,
    assets: {
      idle: `assets/${mainImageName}`,
      working: `assets/${mainImageName}`,
      question: `assets/${mainImageName}`,
      permission: `assets/${mainImageName}`,
      plan_ready: `assets/${mainImageName}`
    },
    ...(hasLottie && {
      lottieAssets: {
        working: 'assets/working.lottie'
      },
      lottieScale: {
        working: 1.0
      }
    }),
    animations: {
      idle: {
        type: 'static',
        transform: 'none',
        overlay: { kind: 'none' }
      },
      working: {
        type: 'loop',
        durationMs: 1800,
        transform: params.transform,
        overlay: { kind: 'none' }
      },
      question: {
        type: 'loop',
        durationMs: 1200,
        transform: params.transform,
        overlay: { kind: 'bubble', symbol: '?', tint: params.questionColor }
      },
      permission: {
        type: 'loop',
        durationMs: 800,
        transform: params.transform,
        overlay: { kind: 'bubble', symbol: '!', tint: params.permissionColor }
      },
      plan_ready: {
        type: 'loop',
        durationMs: 1600,
        transform: 'pulse',
        overlay: { kind: 'glow', symbol: '✓', tint: params.planReadyColor }
      }
    },
    defaultSize: params.defaultSize
  }

  // Save manifest
  await fs.writeFile(
    path.join(petDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  )

  return manifest
}

/**
 * List all custom pets
 */
export async function listCustomPets(): Promise<LoadedPet[]> {
  try {
    const customPetsDir = getCustomPetsDir()

    // Check if directory exists
    try {
      await fs.access(customPetsDir)
    } catch {
      // Directory doesn't exist yet, return empty array
      return []
    }

    const entries = await fs.readdir(customPetsDir, { withFileTypes: true })
    const pets: LoadedPet[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      try {
        const petDir = path.join(customPetsDir, entry.name)
        const manifestPath = path.join(petDir, 'manifest.json')

        // Read manifest
        const manifestContent = await fs.readFile(manifestPath, 'utf-8')
        const manifest: PetManifest = JSON.parse(manifestContent)

        // Validate manifest structure
        if (!manifest.id || !manifest.name || !manifest.assets) {
          console.warn(`Invalid custom pet manifest: ${entry.name}`)
          continue
        }

        // Resolve asset paths to file:// URLs
        const resolvedAssets: Record<PetState, string> = {} as Record<PetState, string>
        for (const [state, relativePath] of Object.entries(manifest.assets) as Array<
          [PetState, string]
        >) {
          const assetPath = path.join(petDir, relativePath)
          // Convert to file:// URL for loading in renderer
          resolvedAssets[state] = `file://${assetPath}`
        }

        // Resolve Lottie assets if present
        let resolvedLottieAssets: Partial<Record<PetState, string>> | undefined
        if (manifest.lottieAssets) {
          resolvedLottieAssets = {}
          for (const [state, relativePath] of Object.entries(manifest.lottieAssets) as Array<
            [PetState, string]
          >) {
            const assetPath = path.join(petDir, relativePath)
            resolvedLottieAssets[state] = `file://${assetPath}`
          }
        }

        pets.push({
          ...manifest,
          resolvedAssets,
          resolvedLottieAssets
        })
      } catch (error) {
        console.error(`Failed to load custom pet ${entry.name}:`, error)
        // Continue loading other pets
      }
    }

    return pets
  } catch (error) {
    console.error('Failed to list custom pets:', error)
    return []
  }
}

/**
 * Delete a custom pet
 */
export async function deleteCustomPet(petId: string): Promise<void> {
  if (!petId.startsWith('custom-')) {
    throw new Error('Cannot delete built-in pet')
  }

  const customPetsDir = getCustomPetsDir()
  const petDir = path.join(customPetsDir, petId)

  // Check if pet exists
  try {
    await fs.access(petDir)
  } catch {
    throw new Error(`Pet ${petId} not found`)
  }

  // Delete the entire pet directory
  await fs.rm(petDir, { recursive: true, force: true })
}

/**
 * Update a custom pet's manifest
 */
export async function updateCustomPet(
  petId: string,
  updates: Partial<PetManifest>
): Promise<PetManifest> {
  if (!petId.startsWith('custom-')) {
    throw new Error('Cannot update built-in pet')
  }

  const customPetsDir = getCustomPetsDir()
  const petDir = path.join(customPetsDir, petId)
  const manifestPath = path.join(petDir, 'manifest.json')

  // Read existing manifest
  const manifestContent = await fs.readFile(manifestPath, 'utf-8')
  const manifest: PetManifest = JSON.parse(manifestContent)

  // Apply updates (but preserve id, version, author, custom flag)
  const updatedManifest: PetManifest = {
    ...manifest,
    ...updates,
    id: manifest.id,
    version: manifest.version,
    author: manifest.author,
    custom: true
  }

  // Save updated manifest
  await fs.writeFile(manifestPath, JSON.stringify(updatedManifest, null, 2), 'utf-8')

  return updatedManifest
}

/**
 * Load a specific asset file as a data URL
 */
export async function loadAssetAsDataUrl(petId: string, relativePath: string): Promise<string> {
  const customPetsDir = getCustomPetsDir()
  const assetPath = path.join(customPetsDir, petId, relativePath)

  // Validate path (security check)
  const normalizedPath = path.normalize(assetPath)
  if (!normalizedPath.startsWith(customPetsDir)) {
    throw new Error('Invalid asset path: path traversal not allowed')
  }

  // Read file
  const buffer = await fs.readFile(assetPath)

  // Determine MIME type from extension
  const ext = path.extname(assetPath).toLowerCase()
  let mimeType = 'application/octet-stream'
  if (ext === '.png') mimeType = 'image/png'
  else if (ext === '.webp') mimeType = 'image/webp'
  else if (ext === '.lottie') mimeType = 'application/json'

  // Convert to data URL
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}
