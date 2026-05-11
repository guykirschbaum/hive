import { fileTypeFromBuffer } from 'file-type'
import { nativeImage } from 'electron'
import fs from 'fs/promises'

export interface ValidationResult {
  valid: boolean
  error?: string
  warning?: string
  dimensions?: { width: number; height: number }
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_LOTTIE_SIZE = 5 * 1024 * 1024 // 5MB
const MIN_DIMENSION = 128
const RECOMMENDED_DIMENSION = 512

/**
 * Validate an image file (PNG or WebP)
 */
export async function validateImageFile(buffer: Buffer): Promise<ValidationResult> {
  try {
    // Check file size
    if (buffer.length > MAX_IMAGE_SIZE) {
      const sizeMB = (buffer.length / (1024 * 1024)).toFixed(1)
      return {
        valid: false,
        error: `File size too large (${sizeMB}MB). Maximum is 5MB`
      }
    }

    // Check file type by magic bytes
    const fileType = await fileTypeFromBuffer(buffer)
    if (!fileType || !['image/png', 'image/webp'].includes(fileType.mime)) {
      return {
        valid: false,
        error: 'Invalid file format. Please upload PNG or WebP'
      }
    }

    // Validate image can be read and get dimensions
    const image = nativeImage.createFromBuffer(buffer)
    if (image.isEmpty()) {
      return {
        valid: false,
        error: 'Could not read image file. The file may be corrupted'
      }
    }

    const size = image.getSize()
    const { width, height } = size

    // Check minimum dimensions
    if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
      return {
        valid: false,
        error: `Image too small (${width}x${height}px). Minimum dimensions are ${MIN_DIMENSION}x${MIN_DIMENSION}px`
      }
    }

    // Check if square
    let warning: string | undefined
    if (width !== height) {
      warning = `Image is not square (${width}x${height}px). Non-square images will be letterboxed`
    }

    // Check if below recommended size
    if (width < RECOMMENDED_DIMENSION && height < RECOMMENDED_DIMENSION && !warning) {
      warning = `Image is smaller than recommended (${width}x${height}px). Recommended: ${RECOMMENDED_DIMENSION}x${RECOMMENDED_DIMENSION}px`
    }

    // Warn about large files
    if (buffer.length > 4 * 1024 * 1024 && !warning) {
      const sizeMB = (buffer.length / (1024 * 1024)).toFixed(1)
      warning = `Large image (${sizeMB}MB) may affect performance`
    }

    return {
      valid: true,
      dimensions: { width, height },
      warning
    }
  } catch (error) {
    return {
      valid: false,
      error: `Failed to validate image: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

/**
 * Validate a Lottie file (.lottie format)
 */
export async function validateLottieFile(buffer: Buffer): Promise<ValidationResult> {
  try {
    // Check file size
    if (buffer.length > MAX_LOTTIE_SIZE) {
      const sizeMB = (buffer.length / (1024 * 1024)).toFixed(1)
      return {
        valid: false,
        error: `File size too large (${sizeMB}MB). Maximum is 5MB`
      }
    }

    // Try to parse as JSON (Lottie files are JSON)
    let json: any
    try {
      json = JSON.parse(buffer.toString('utf-8'))
    } catch {
      return {
        valid: false,
        error: 'Could not read Lottie file. Please ensure it is a valid .lottie format'
      }
    }

    // Basic Lottie structure validation
    // A valid Lottie JSON should have at least these properties
    if (!json || typeof json !== 'object') {
      return {
        valid: false,
        error: 'Invalid Lottie format: not a valid JSON object'
      }
    }

    // DotLottie files can have different structures, but should have some animation data
    // Check for common Lottie properties (v, fr, ip, op, layers, or animations for DotLottie)
    const hasLottieProps =
      json.v !== undefined || // Lottie version
      json.fr !== undefined || // Frame rate
      json.layers !== undefined || // Layers
      json.animations !== undefined // DotLottie animations

    if (!hasLottieProps) {
      return {
        valid: false,
        error: 'Invalid Lottie file structure. Please export from LottieFiles or Adobe After Effects'
      }
    }

    let warning: string | undefined
    if (buffer.length > 4 * 1024 * 1024) {
      const sizeMB = (buffer.length / (1024 * 1024)).toFixed(1)
      warning = `Large Lottie file (${sizeMB}MB) may affect performance`
    }

    return {
      valid: true,
      warning
    }
  } catch (error) {
    return {
      valid: false,
      error: `Failed to validate Lottie file: ${error instanceof Error ? error.message : 'Unknown error'}`
    }
  }
}

/**
 * Validate a pet name
 */
export function validatePetName(name: string): ValidationResult {
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

  // Check for reasonable characters (allow unicode for international names)
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

/**
 * Sanitize a pet name for use as an ID
 */
export function sanitizePetName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/[^a-z0-9-]/g, '') // Remove special characters
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .substring(0, 50) // Limit length
}

/**
 * Validate file path for security
 */
export function validateFilePath(filePath: string): ValidationResult {
  // Check for path traversal attempts
  if (filePath.includes('..') || filePath.includes('~')) {
    return {
      valid: false,
      error: 'Invalid file path: path traversal not allowed'
    }
  }

  // Check for absolute paths (should be relative within pet directory)
  if (filePath.startsWith('/') || /^[a-zA-Z]:/.test(filePath)) {
    return {
      valid: false,
      error: 'Invalid file path: absolute paths not allowed'
    }
  }

  return {
    valid: true
  }
}
