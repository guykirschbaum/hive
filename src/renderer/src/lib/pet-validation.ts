/**
 * Client-side validation utilities for pet uploads
 * Pre-flight validation before sending to main process
 */

const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_LOTTIE_SIZE = 5 * 1024 * 1024 // 5MB
const MIN_DIMENSION = 128
const RECOMMENDED_DIMENSION = 512

export interface ClientValidationResult {
  valid: boolean
  error?: string
  warning?: string
  dimensions?: { width: number; height: number }
}

/**
 * Validate image file on the client side
 */
export async function validateImageFileClient(file: File): Promise<ClientValidationResult> {
  // Check file extension
  const ext = file.name.toLowerCase().split('.').pop()
  if (!ext || !['png', 'webp'].includes(ext)) {
    return {
      valid: false,
      error: 'Invalid file format. Please upload PNG or WebP'
    }
  }

  // Check file size
  if (file.size > MAX_IMAGE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1)
    return {
      valid: false,
      error: `File size too large (${sizeMB}MB). Maximum is 5MB`
    }
  }

  // Read image dimensions
  try {
    const dimensions = await getImageDimensions(file)

    // Check minimum dimensions
    if (dimensions.width < MIN_DIMENSION || dimensions.height < MIN_DIMENSION) {
      return {
        valid: false,
        error: `Image too small (${dimensions.width}x${dimensions.height}px). Minimum is ${MIN_DIMENSION}x${MIN_DIMENSION}px`
      }
    }

    // Check if square
    let warning: string | undefined
    if (dimensions.width !== dimensions.height) {
      warning = `Image is not square (${dimensions.width}x${dimensions.height}px). It will be letterboxed`
    }

    // Check if below recommended size
    if (
      dimensions.width < RECOMMENDED_DIMENSION &&
      dimensions.height < RECOMMENDED_DIMENSION &&
      !warning
    ) {
      warning = `Image smaller than recommended (${dimensions.width}x${dimensions.height}px). Recommended: ${RECOMMENDED_DIMENSION}x${RECOMMENDED_DIMENSION}px`
    }

    // Warn about large files
    if (file.size > 4 * 1024 * 1024 && !warning) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1)
      warning = `Large file (${sizeMB}MB) may affect performance`
    }

    return {
      valid: true,
      dimensions,
      warning
    }
  } catch (error) {
    return {
      valid: false,
      error: 'Could not read image file. The file may be corrupted'
    }
  }
}

/**
 * Validate Lottie file on the client side
 */
export async function validateLottieFileClient(file: File): Promise<ClientValidationResult> {
  // Check file extension
  const ext = file.name.toLowerCase().split('.').pop()
  if (!ext || ext !== 'lottie') {
    return {
      valid: false,
      error: 'Invalid file format. Please upload .lottie format'
    }
  }

  // Check file size
  if (file.size > MAX_LOTTIE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1)
    return {
      valid: false,
      error: `File size too large (${sizeMB}MB). Maximum is 5MB`
    }
  }

  // Try to parse as JSON
  try {
    const text = await file.text()
    const json = JSON.parse(text)

    // Basic structure validation
    if (!json || typeof json !== 'object') {
      return {
        valid: false,
        error: 'Invalid Lottie format: not a valid JSON object'
      }
    }

    // Check for Lottie properties
    const hasLottieProps =
      json.v !== undefined ||
      json.fr !== undefined ||
      json.layers !== undefined ||
      json.animations !== undefined

    if (!hasLottieProps) {
      return {
        valid: false,
        error: 'Invalid Lottie file structure'
      }
    }

    let warning: string | undefined
    if (file.size > 4 * 1024 * 1024) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1)
      warning = `Large file (${sizeMB}MB) may affect performance`
    }

    return {
      valid: true,
      warning
    }
  } catch {
    return {
      valid: false,
      error: 'Could not read Lottie file. Please ensure it is valid JSON'
    }
  }
}

/**
 * Get image dimensions from a File object
 */
export function getImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.width, height: img.height })
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }

    img.src = url
  })
}

/**
 * Read file as ArrayBuffer for IPC
 */
export function readFileAsArrayBuffer(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result))
      } else {
        reject(new Error('Failed to read file'))
      }
    }

    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }

    reader.readAsArrayBuffer(file)
  })
}

/**
 * Validate pet name
 */
export function validatePetName(name: string): ClientValidationResult {
  if (!name || name.trim().length === 0) {
    return {
      valid: false,
      error: 'Pet name is required'
    }
  }

  const trimmed = name.trim()

  if (trimmed.length > 50) {
    return {
      valid: false,
      error: 'Pet name too long. Maximum is 50 characters'
    }
  }

  if (trimmed.length < 2) {
    return {
      valid: false,
      error: 'Pet name too short. Minimum is 2 characters'
    }
  }

  return {
    valid: true
  }
}
