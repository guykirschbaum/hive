import { useState, useRef } from 'react'
import { Check, ChevronDown, ChevronUp, Upload, X, AlertCircle, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import {
  validateImageFileClient,
  validateLottieFileClient,
  validatePetName,
  readFileAsArrayBuffer,
  type ClientValidationResult
} from '@/lib/pet-validation'
import { reloadCustomPets } from '@/pet/registry'

type Transform = 'spin' | 'bounce' | 'pulse' | 'none'
type PetSize = 'S' | 'M' | 'L'

const TRANSFORM_OPTIONS: Array<{ id: Transform; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'spin', label: 'Spin' },
  { id: 'bounce', label: 'Bounce' },
  { id: 'pulse', label: 'Pulse' }
]

const SIZE_OPTIONS: Array<{ id: PetSize; label: string; description: string }> = [
  { id: 'S', label: 'S', description: '64 px' },
  { id: 'M', label: 'M', description: '96 px' },
  { id: 'L', label: 'L', description: '128 px' }
]

interface CustomPetFormProps {
  onSuccess?: (petId: string) => void
}

export function CustomPetForm({ onSuccess }: CustomPetFormProps): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  // Form state
  const [petName, setPetName] = useState('')
  const [nameValidation, setNameValidation] = useState<ClientValidationResult | null>(null)

  const [mainImage, setMainImage] = useState<File | null>(null)
  const [mainImageValidation, setMainImageValidation] = useState<ClientValidationResult | null>(
    null
  )
  const [mainImagePreview, setMainImagePreview] = useState<string | null>(null)

  const [lottieFile, setLottieFile] = useState<File | null>(null)
  const [lottieValidation, setLottieValidation] = useState<ClientValidationResult | null>(null)

  const [transform, setTransform] = useState<Transform>('bounce')
  const [questionColor, setQuestionColor] = useState('#3b82f6')
  const [permissionColor, setPermissionColor] = useState('#ef4444')
  const [planReadyColor, setPlanReadyColor] = useState('#22c55e')
  const [defaultSize, setDefaultSize] = useState<PetSize>('M')

  const mainImageInputRef = useRef<HTMLInputElement>(null)
  const lottieInputRef = useRef<HTMLInputElement>(null)

  const handleNameChange = (value: string) => {
    setPetName(value)
    if (value.trim()) {
      setNameValidation(validatePetName(value))
    } else {
      setNameValidation(null)
    }
  }

  const handleMainImageSelect = async (file: File) => {
    setMainImage(file)
    const validation = await validateImageFileClient(file)
    setMainImageValidation(validation)

    if (validation.valid) {
      // Create preview
      const preview = URL.createObjectURL(file)
      setMainImagePreview(preview)
    } else {
      setMainImagePreview(null)
    }
  }

  const handleLottieSelect = async (file: File) => {
    setLottieFile(file)
    const validation = await validateLottieFileClient(file)
    setLottieValidation(validation)
  }

  const handleMainImageDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) {
      await handleMainImageSelect(file)
    }
  }

  const handleLottieDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) {
      await handleLottieSelect(file)
    }
  }

  const handleCreate = async () => {
    // Final validation
    const nameVal = validatePetName(petName)
    if (!nameVal.valid) {
      toast.error(nameVal.error ?? 'Invalid pet name')
      return
    }

    if (!mainImage || !mainImageValidation?.valid) {
      toast.error('Please upload a valid image')
      return
    }

    setIsCreating(true)

    try {
      // Read main image
      const mainImageBuffer = await readFileAsArrayBuffer(mainImage)
      const mainImageExt = mainImage.name.toLowerCase().endsWith('.webp') ? 'webp' : 'png'

      // Read Lottie if provided
      let lottieBuffer: Uint8Array | undefined
      if (lottieFile && lottieValidation?.valid) {
        lottieBuffer = await readFileAsArrayBuffer(lottieFile)
      }

      // Create pet
      const result = await window.petOps.createCustomPet({
        name: petName,
        mainImageBuffer,
        mainImageExt,
        lottieBuffer,
        transform,
        questionColor,
        permissionColor,
        planReadyColor,
        defaultSize
      })

      if (!result.success) {
        toast.error(result.error ?? 'Failed to create pet')
        return
      }

      // Success!
      toast.success(`Pet "${petName}" created successfully!`)

      // Reload custom pets
      await reloadCustomPets()

      // Reset form
      handleCancel()

      // Notify parent
      if (result.data && onSuccess) {
        onSuccess(result.data.id)
      }
    } catch (error) {
      console.error('Failed to create pet:', error)
      toast.error('Failed to create pet. Please try again.')
    } finally {
      setIsCreating(false)
    }
  }

  const handleCancel = () => {
    setPetName('')
    setNameValidation(null)
    setMainImage(null)
    setMainImageValidation(null)
    if (mainImagePreview) {
      URL.revokeObjectURL(mainImagePreview)
      setMainImagePreview(null)
    }
    setLottieFile(null)
    setLottieValidation(null)
    setTransform('bounce')
    setQuestionColor('#3b82f6')
    setPermissionColor('#ef4444')
    setPlanReadyColor('#22c55e')
    setDefaultSize('M')
    setIsExpanded(false)
  }

  const canCreate =
    petName.trim().length > 0 &&
    nameValidation?.valid &&
    mainImage &&
    mainImageValidation?.valid &&
    (!lottieFile || lottieValidation?.valid)

  return (
    <div className="space-y-4 pt-4 border-t">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors"
      >
        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        Create Custom Pet
      </button>

      {/* Form (collapsible) */}
      {isExpanded && (
        <div className="space-y-4 pl-6">
          {/* Pet Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Pet Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={petName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder='e.g., "My Dog", "Office Cat"'
              className={cn(
                'w-full h-9 rounded-md border bg-background px-3 text-sm',
                nameValidation && !nameValidation.valid ? 'border-red-500' : 'border-input'
              )}
            />
            {nameValidation && !nameValidation.valid && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {nameValidation.error}
              </p>
            )}
          </div>

          {/* Main Image Upload */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Main Image <span className="text-red-500">*</span>
            </label>
            <div
              onDrop={handleMainImageDrop}
              onDragOver={(e) => e.preventDefault()}
              className={cn(
                'border-2 border-dashed rounded-md p-4 text-center cursor-pointer hover:border-primary transition-colors',
                mainImage && mainImageValidation?.valid
                  ? 'border-green-500 bg-green-500/5'
                  : mainImageValidation && !mainImageValidation.valid
                    ? 'border-red-500 bg-red-500/5'
                    : 'border-border'
              )}
              onClick={() => mainImageInputRef.current?.click()}
            >
              <input
                ref={mainImageInputRef}
                type="file"
                accept=".png,.webp"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleMainImageSelect(e.target.files[0])}
              />
              {mainImagePreview ? (
                <div className="flex items-center justify-center gap-4">
                  <img src={mainImagePreview} alt="Preview" className="h-16 w-16 object-contain" />
                  <div className="text-left flex-1">
                    <p className="text-sm font-medium">{mainImage?.name}</p>
                    {mainImageValidation?.dimensions && (
                      <p className="text-xs text-muted-foreground">
                        {mainImageValidation.dimensions.width}x{mainImageValidation.dimensions.height}px
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      setMainImage(null)
                      setMainImageValidation(null)
                      if (mainImagePreview) {
                        URL.revokeObjectURL(mainImagePreview)
                        setMainImagePreview(null)
                      }
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm font-medium">Choose file or drag & drop</p>
                  <p className="text-xs text-muted-foreground">
                    PNG or WebP • Square • Max 5MB • 512x512px recommended
                  </p>
                </div>
              )}
            </div>
            {mainImageValidation && !mainImageValidation.valid && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {mainImageValidation.error}
              </p>
            )}
            {mainImageValidation?.warning && (
              <p className="text-xs text-yellow-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {mainImageValidation.warning}
              </p>
            )}
          </div>

          {/* Lottie Upload */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Working Animation (optional)</label>
            <div
              onDrop={handleLottieDrop}
              onDragOver={(e) => e.preventDefault()}
              className={cn(
                'border-2 border-dashed rounded-md p-4 text-center cursor-pointer hover:border-primary transition-colors',
                lottieFile && lottieValidation?.valid
                  ? 'border-green-500 bg-green-500/5'
                  : lottieValidation && !lottieValidation.valid
                    ? 'border-red-500 bg-red-500/5'
                    : 'border-border'
              )}
              onClick={() => lottieInputRef.current?.click()}
            >
              <input
                ref={lottieInputRef}
                type="file"
                accept=".lottie"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleLottieSelect(e.target.files[0])}
              />
              {lottieFile ? (
                <div className="flex items-center justify-center gap-4">
                  <div className="text-left flex-1">
                    <p className="text-sm font-medium">{lottieFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(lottieFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      setLottieFile(null)
                      setLottieValidation(null)
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
                  <p className="text-sm">Choose .lottie file</p>
                  <p className="text-xs text-muted-foreground">Max 5MB • Plays during busy state</p>
                </div>
              )}
            </div>
            {lottieValidation && !lottieValidation.valid && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {lottieValidation.error}
              </p>
            )}
            {lottieValidation?.warning && (
              <p className="text-xs text-yellow-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {lottieValidation.warning}
              </p>
            )}
          </div>

          {/* Transform */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Animation Transform</label>
            <div className="grid grid-cols-4 gap-2">
              {TRANSFORM_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setTransform(option.id)}
                  className={cn(
                    'rounded-md border px-3 py-2 text-sm transition-colors',
                    transform === option.id
                      ? 'border-primary/40 bg-primary/10'
                      : 'border-border bg-muted/30 hover:bg-accent/50'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Overlay Colors */}
          <div className="space-y-3">
            <label className="text-sm font-medium">State Overlay Colors</label>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Question</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={questionColor}
                    onChange={(e) => setQuestionColor(e.target.value)}
                    className="h-8 w-12 rounded border cursor-pointer"
                  />
                  <span className="text-xs text-muted-foreground self-center">?</span>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Permission</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={permissionColor}
                    onChange={(e) => setPermissionColor(e.target.value)}
                    className="h-8 w-12 rounded border cursor-pointer"
                  />
                  <span className="text-xs text-muted-foreground self-center">!</span>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Plan Ready</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={planReadyColor}
                    onChange={(e) => setPlanReadyColor(e.target.value)}
                    className="h-8 w-12 rounded border cursor-pointer"
                  />
                  <span className="text-xs text-muted-foreground self-center">✓</span>
                </div>
              </div>
            </div>
          </div>

          {/* Default Size */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Default Size</label>
            <div className="grid grid-cols-3 gap-2">
              {SIZE_OPTIONS.map((option) => {
                const selected = defaultSize === option.id
                return (
                  <button
                    key={option.id}
                    onClick={() => setDefaultSize(option.id)}
                    className={cn(
                      'flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors',
                      selected
                        ? 'border-primary/40 bg-primary/10'
                        : 'border-border bg-muted/30 hover:bg-accent/50'
                    )}
                  >
                    <span>
                      <span className="block font-medium">{option.label}</span>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    </span>
                    {selected && <Check className="h-4 w-4 text-primary" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isCreating}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!canCreate || isCreating} className="flex-1">
              {isCreating ? (
                <>Creating...</>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Create Pet
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
