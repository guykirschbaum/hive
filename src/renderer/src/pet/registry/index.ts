import type { LoadedPet, PetManifest, PetState } from '@shared/types/pet'

// Built-in pets (loaded at compile time via Vite)
const manifestModules = import.meta.glob('./*/manifest.json', {
  eager: true,
  import: 'default'
}) as Record<string, PetManifest>

const assetModules = import.meta.glob('./*/assets/*', {
  eager: true,
  import: 'default',
  query: '?url'
}) as Record<string, string>

const builtInPets = new Map<string, LoadedPet>()

for (const [manifestPath, manifest] of Object.entries(manifestModules)) {
  const baseDir = manifestPath.replace(/\/manifest\.json$/, '')
  const resolvedAssets = {} as Record<PetState, string>
  const resolvedLottieAssets: Partial<Record<PetState, string>> = {}

  for (const [state, relativePath] of Object.entries(manifest.assets) as Array<
    [PetState, string]
  >) {
    const assetPath = `${baseDir}/${relativePath}`
    resolvedAssets[state] = assetModules[assetPath] ?? relativePath
  }

  for (const [state, relativePath] of Object.entries(manifest.lottieAssets ?? {}) as Array<
    [PetState, string]
  >) {
    const assetPath = `${baseDir}/${relativePath}`
    resolvedLottieAssets[state] = assetModules[assetPath] ?? relativePath
  }

  builtInPets.set(manifest.id, {
    ...manifest,
    resolvedAssets,
    resolvedLottieAssets: Object.keys(resolvedLottieAssets).length
      ? resolvedLottieAssets
      : undefined
  })
}

// Custom pets (loaded at runtime via IPC)
const customPets = new Map<string, LoadedPet>()

/**
 * Load custom pets from ~/.hive/custom-pets/ via IPC
 * Call this on app startup and after creating/deleting custom pets
 */
export async function loadCustomPets(): Promise<void> {
  try {
    const result = await window.petOps.listCustomPets()

    if (!result.success) {
      console.error('Failed to load custom pets:', result.error)
      return
    }

    customPets.clear()

    for (const pet of result.data ?? []) {
      try {
        // Validate manifest structure
        if (!pet.id || !pet.name || !pet.assets) {
          console.warn(`Invalid custom pet manifest: ${pet.id}`)
          continue
        }

        // Validate assets exist
        if (!pet.resolvedAssets || Object.keys(pet.resolvedAssets).length === 0) {
          console.warn(`Custom pet has no assets: ${pet.id}`)
          continue
        }

        customPets.set(pet.id, pet)
      } catch (petError) {
        console.error(`Failed to load custom pet ${pet.id}:`, petError)
        // Continue loading other pets
      }
    }
  } catch (error) {
    console.error('Failed to load custom pets:', error)
    // App continues with just built-in pets
  }
}

/**
 * List all pets (built-in + custom)
 */
export function listPets(): LoadedPet[] {
  return [...Array.from(builtInPets.values()), ...Array.from(customPets.values())]
}

/**
 * Get pet by ID, with fallback chain:
 * 1. Custom pet with matching ID
 * 2. Built-in pet with matching ID
 * 3. Built-in "bee" pet
 * 4. First available pet
 */
export function getPet(id: string): LoadedPet {
  return (
    customPets.get(id) ?? builtInPets.get(id) ?? builtInPets.get('bee') ?? listPets()[0]
  )
}

/**
 * Check if a pet ID belongs to a custom pet
 */
export function isCustomPet(id: string): boolean {
  return customPets.has(id)
}

/**
 * Reload custom pets (call after create/delete operations)
 */
export async function reloadCustomPets(): Promise<void> {
  await loadCustomPets()
}

/**
 * Get the built-in bee pet (for fallback)
 */
export function getBee(): LoadedPet | undefined {
  return builtInPets.get('bee')
}
