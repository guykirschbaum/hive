# Custom Pet Image Upload - Design Specification

**Date:** 2026-05-11  
**Feature:** Allow users to upload custom pet images to personalize the Hive busy state indicator  
**Branch:** `custom_pet`

---

## Overview

This feature extends the existing Pet system in Hive to support user-uploaded custom pet images and animations. Users can upload their own PNG/WebP images and optional Lottie animations, configure animation behaviors and overlay styles, and use their custom pets alongside built-in pets (Bee, Corgi).

The custom pet feature maintains the same architecture as built-in pets (manifest + assets pattern) while adding a user-friendly creation UI and robust error handling to prevent app crashes from corrupted or missing files.

---

## Requirements Summary

### User Requirements
- Upload custom pet images (PNG, WebP) with size/format validation
- Upload optional Lottie animations for "working" state
- Configure animation transforms (spin, bounce, pulse, none)
- Customize overlay colors and symbols for different states
- Set default size preference (S, M, L)
- Preview pet in all states before saving
- Custom pets persist across app restarts
- Share custom pets by copying folder

### Technical Requirements
- Store custom pets in `~/.hive/custom-pets/[pet-id]/`
- Generate manifest.json matching built-in pet structure
- Validate file format, size, and dimensions
- Graceful error handling (no crashes from corrupted files)
- IPC communication for file system operations
- Auto-discover custom pets at runtime
- Support both static images and Lottie animations
- Fallback to built-in "bee" if custom pet fails to load

---

## Architecture

### System Components

#### 1. Custom Pet Storage
- **Location:** `~/.hive/custom-pets/[pet-id]/`
- **Structure:**
  ```
  ~/.hive/custom-pets/
    ├── custom-my-dog/
    │   ├── manifest.json
    │   └── assets/
    │       ├── main.png (or main.webp)
    │       └── working.lottie (optional)
    ├── custom-my-cat/
    │   ├── manifest.json
    │   └── assets/
    │       └── main.png
  ```

#### 2. Registry Extension
Extend `src/renderer/src/pet/registry/index.ts` to load both:
- **Built-in pets:** Loaded via `import.meta.glob` at compile time (existing)
- **Custom pets:** Loaded via IPC at runtime (new)

**Implementation approach:**
- Two separate `Map<string, LoadedPet>` instances (builtInPets, customPets)
- `loadCustomPets()` async function fetches from main process
- `listPets()` combines both maps
- `getPet(id)` checks custom first, then built-in, with fallback to bee
- `isCustomPet(id)` helper to distinguish custom from built-in

#### 3. IPC Handlers (Main Process)
New handlers in `src/main/ipc/pet-handlers.ts`:

| Handler | Purpose | Returns |
|---------|---------|---------|
| `pet:create-custom` | Validates and creates new custom pet | `{ success: boolean, data?: PetManifest, error?: string }` |
| `pet:list-custom` | Lists all custom pets from user directory | `{ success: boolean, data?: LoadedPet[], error?: string }` |
| `pet:delete-custom` | Removes a custom pet | `{ success: boolean, error?: string }` |
| `pet:update-custom` | Updates custom pet manifest | `{ success: boolean, data?: PetManifest, error?: string }` |
| `pet:load-asset` | Loads asset file and returns as data URL | `{ success: boolean, data?: string, error?: string }` |

#### 4. UI Components (Renderer Process)
Extend `src/renderer/src/components/settings/SettingsPet.tsx`:
- Add collapsible "Create Custom Pet" section
- File upload with drag & drop support
- Configuration form (name, transform, colors, size)
- Validation feedback (errors, warnings, success)
- Preview modal component
- Delete custom pet functionality

### Data Flow

```
User uploads image → 
  Renderer validates format/size/dimensions → 
    IPC: pet:create-custom → 
      Main process validates file content → 
        Save to ~/.hive/custom-pets/[id]/ → 
          Generate manifest.json → 
            Return success → 
              Reload custom pets registry → 
                Custom pet appears in dropdown
```

---

## File Upload & Validation

### Upload Specifications

#### Static Images
- **Formats Accepted:** PNG, WebP
- **Max File Size:** 5MB per image
- **Recommended Dimensions:** 512x512px (square)
- **Minimum Dimensions:** 128x128px
- **Aspect Ratio:** Must be square (1:1) - show warning if not, but allow

#### Lottie Animations
- **Formats Accepted:** `.lottie` files only
- **Max File Size:** 5MB per Lottie file
- **Optional:** Only for "working" state animation
- **Validation:** Check that file is valid DotLottie format (parseable JSON)

### Validation Rules

#### Pre-upload Validation (Renderer)
1. Check file extension matches accepted formats
2. Check file size before reading (`file.size <= MAX_SIZE`)
3. For images: Read dimensions using `Image` element
   - `const img = new Image(); img.onload = () => check(img.width, img.height)`
4. Show user-friendly error messages immediately

#### Post-upload Validation (Main Process)
1. Verify file content matches extension (magic byte checking)
   - PNG: `89 50 4E 47 0D 0A 1A 0A`
   - WebP: `52 49 46 46 ... 57 45 42 50`
2. For images: Use native image library to validate (electron nativeImage)
3. For Lottie: Parse JSON structure to ensure valid format
4. Sanitize file names (no special chars, max 50 chars, lowercase)
5. Check total custom pets count (limit: 50)

### User Guidelines (Displayed in UI)

```
📁 Image Guidelines:
  ✓ PNG or WebP format
  ✓ Square dimensions (512x512px recommended)
  ✓ Maximum 5MB file size
  ✓ Transparent backgrounds work best

🎬 Animation Guidelines:
  ✓ .lottie format (optional, for "working" state)
  ✓ Maximum 5MB file size
  ✓ Export from LottieFiles or Adobe After Effects
  ✓ Keep animation duration under 3 seconds
```

### Error Messages

**User-friendly messages for common issues:**
- `"Image must be square (your image is 800x600px)"`
- `"File size too large (8.2MB). Maximum is 5MB"`
- `"Invalid file format. Please upload PNG or WebP"`
- `"Could not read Lottie file. Please ensure it's a valid .lottie format"`
- `"Pet name too long. Maximum is 50 characters"`
- `"A pet with this name already exists. Please choose a different name"`
- `"Too many custom pets (50). Please delete some before creating new ones"`
- `"Failed to create pet directory. Please check disk space and permissions"`

---

## Custom Pet Creation UI

### SettingsPet.tsx Layout

Add new collapsible section below the existing "Show pet" button:

```
┌─────────────────────────────────────────────────┐
│ [▼] Create Custom Pet                           │
└─────────────────────────────────────────────────┘
  
  Pet Name *
  [________________________]
  Example: "My Dog", "Office Cat"
  
  Main Image (required) *
  ┌─────────────────────────────────────────────┐
  │  [📁 Choose File...] or drag & drop here    │
  └─────────────────────────────────────────────┘
  ✓ PNG or WebP • Square • Max 5MB • 512x512px recommended
  
  [Preview: thumbnail if uploaded]
  
  Working Animation (optional)
  ┌─────────────────────────────────────────────┐
  │  [📁 Choose .lottie File...] or drag & drop │
  └─────────────────────────────────────────────┘
  ✓ .lottie format • Max 5MB • Plays when worktree is busy
  
  Animation Settings
  
  Transform
  ( ) None  ( ) Spin  (•) Bounce  ( ) Pulse
  
  Question State Overlay
  Color: [🎨 #3b82f6] Symbol: [?]
  
  Permission State Overlay  
  Color: [🎨 #ef4444] Symbol: [!]
  
  Plan Ready State Overlay
  Color: [🎨 #22c55e] Symbol: [✓]
  
  Default Size
  ( ) S (64px)  (•) M (96px)  ( ) L (128px)
  
  [Preview States]  [Cancel]  [Create Pet]
```

### UI Behavior

#### Collapsed State
- Shows just the header `[▶] Create Custom Pet` with right-pointing arrow
- Clicking expands the form
- Default state on component mount

#### File Upload
- **Click to upload:** Opens native file picker with appropriate filters
  - Images: `.png,.webp`
  - Lottie: `.lottie`
- **Drag & drop:** Visual feedback on dragover (border highlight)
- **Thumbnail preview:** Shows uploaded image (scaled to 96px)
- **Remove button:** X icon to clear uploaded file

#### Form Defaults
- **Pet Name:** Empty (required field)
- **Transform:** Bounce (most common)
- **Question Color:** `#3b82f6` (blue)
- **Permission Color:** `#ef4444` (red)  
- **Plan Ready Color:** `#22c55e` (green)
- **Symbols:** `?`, `!`, `✓` (standard)
- **Default Size:** M

#### Validation Feedback
- **Invalid file:** Red border + error message below upload area
- **Valid file:** Green checkmark icon next to filename
- **Empty name:** Red border on name input when focused and empty
- **Live validation:** Check as user types/selects files

#### Preview Modal
- **Trigger:** Click "Preview States" button
- **Content:** Shows pet in all 5 states with animations
  - Idle (static)
  - Working (with Lottie if uploaded, else spinning/bouncing)
  - Question (with ? bubble)
  - Permission (with ! bubble)
  - Plan Ready (with ✓ glow)
- **Layout:** Horizontal row or grid showing all states simultaneously
- **Controls:** Close button, optional "Create Pet" shortcut

#### Create Button
- **Disabled when:**
  - No main image uploaded
  - No pet name entered
  - File validation errors present
- **Enabled:** Primary button style
- **On click:**
  1. Show loading spinner on button
  2. Call `window.petOps.createCustomPet(data)`
  3. If success:
     - Collapse form
     - Clear all inputs
     - Show success toast: "Pet created successfully!"
     - Reload custom pets
     - Automatically select new pet in dropdown
  4. If failure:
     - Show error toast with specific message
     - Keep form open for user to fix issues

#### Cancel Button
- Clears all form inputs
- Collapses the section
- No confirmation needed (no data saved yet)

---

## Manifest Generation & Storage

### Generated Manifest Structure

When user creates a custom pet, the system generates this `manifest.json`:

```json
{
  "id": "custom-my-pet-name",
  "name": "My Pet Name",
  "version": "1.0.0",
  "author": "Custom",
  "custom": true,
  "assets": {
    "idle": "assets/main.png",
    "working": "assets/main.png",
    "question": "assets/main.png",
    "permission": "assets/main.png",
    "plan_ready": "assets/main.png"
  },
  "lottieAssets": {
    "working": "assets/working.lottie"
  },
  "lottieScale": {
    "working": 1.0
  },
  "animations": {
    "idle": {
      "type": "static",
      "transform": "none",
      "overlay": { "kind": "none" }
    },
    "working": {
      "type": "loop",
      "durationMs": 1800,
      "transform": "bounce",
      "overlay": { "kind": "none" }
    },
    "question": {
      "type": "loop",
      "durationMs": 1200,
      "transform": "bounce",
      "overlay": { "kind": "bubble", "symbol": "?", "tint": "#3b82f6" }
    },
    "permission": {
      "type": "loop",
      "durationMs": 800,
      "transform": "bounce",
      "overlay": { "kind": "bubble", "symbol": "!", "tint": "#ef4444" }
    },
    "plan_ready": {
      "type": "loop",
      "durationMs": 1600,
      "transform": "pulse",
      "overlay": { "kind": "glow", "symbol": "✓", "tint": "#22c55e" }
    }
  },
  "defaultSize": "M"
}
```

### Key Manifest Properties

- **`id`**: Unique identifier (format: `custom-{sanitized-name}`)
- **`custom: true`**: Flag to distinguish from built-in pets
- **`assets`**: Same main image used for all states (simpler UX)
- **`lottieAssets`**: Optional, only for "working" state
- **`lottieScale`**: Defaults to 1.0, can be manually adjusted later
- **`animations`**: User-configured transform and overlay per state

### ID Generation Algorithm

```typescript
function generatePetId(name: string): string {
  // Sanitize: lowercase, spaces to hyphens, remove special chars
  let sanitized = name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .substring(0, 50)
  
  let id = `custom-${sanitized}`
  
  // Handle collisions
  let counter = 2
  while (petExists(id)) {
    id = `custom-${sanitized}-${counter}`
    counter++
  }
  
  return id
}
```

### File Naming

- **Main image:** `assets/main.png` or `assets/main.webp` (preserve original format)
- **Lottie animation:** `assets/working.lottie`
- **Manifest:** `manifest.json` (always this name)

---

## Registry Integration

### Current Registry Behavior

**`src/renderer/src/pet/registry/index.ts`:**
- Uses Vite's `import.meta.glob` to load built-in pets at build time
- All pets bundled with the app
- Synchronous loading

### New Hybrid Registry Approach

**Built-in pets:** Loaded via `import.meta.glob` at compile time (existing)  
**Custom pets:** Loaded via IPC at runtime (new)

### Implementation

```typescript
// Modified registry/index.ts

// Built-in pets (existing)
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

// ... existing built-in pet loading logic ...

// Custom pets (new)
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
  return [
    ...Array.from(builtInPets.values()),
    ...Array.from(customPets.values())
  ]
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
    customPets.get(id) ??
    builtInPets.get(id) ??
    builtInPets.get('bee') ??
    listPets()[0]
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
```

### Loading Strategy

1. **App startup:** 
   - SettingsPet component calls `loadCustomPets()` on mount
   - Non-blocking: app works with built-in pets if custom pets fail

2. **After creation:**
   - Call `reloadCustomPets()` after successful pet creation
   - New pet immediately appears in dropdown

3. **After deletion:**
   - Call `reloadCustomPets()` after deletion
   - Remove from dropdown

4. **Manual reload:**
   - Add "Refresh Custom Pets" button in settings (dev feature)

### Asset Resolution

**Built-in pets:**
- Use bundled URLs from `import.meta.glob`
- Example: `blob:http://localhost:5173/abc123`

**Custom pets:**
- Use custom protocol handler: `pet://custom-my-dog/assets/main.png`
- Register `pet://` protocol in Electron main process
- Handler resolves to file path: `~/.hive/custom-pets/custom-my-dog/assets/main.png`
- Returns file data as data URL or registers as custom protocol

**Alternative approach (simpler):**
- IPC handler `pet:load-asset` takes `(petId, assetPath)`
- Main process reads file from disk
- Returns as base64 data URL
- Renderer caches in memory

---

## Error Handling & Recovery

**Critical Goal:** Prevent app crashes from corrupted or missing custom pet files.

### 1. Registry Loading (Graceful Degradation)

```typescript
export async function loadCustomPets(): Promise<void> {
  try {
    const result = await window.petOps.listCustomPets()
    
    if (!result.success) {
      console.error('Failed to load custom pets:', result.error)
      // App continues with built-in pets only
      return
    }
    
    customPets.clear()
    
    for (const pet of result.data ?? []) {
      try {
        // Validate manifest structure
        if (!pet.id || !pet.name || !pet.assets) {
          console.warn(`Invalid custom pet manifest: ${pet.id}`)
          continue // Skip invalid pet
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
```

### 2. Image Loading (Fallback Chain)

**In `PetSprite.tsx` component:**

```typescript
const [imageError, setImageError] = useState(false)
const [lottieError, setLottieError] = useState(false)

const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  setImageError(true)
  console.warn(`Failed to load pet image: ${pet.id} state: ${state}`, e)
}

const handleLottieError = (error: Error) => {
  setLottieError(true)
  console.warn(`Failed to load Lottie animation: ${pet.id}`, error)
}

// Rendering logic with fallback:
const currentState = state ?? 'idle'
const shouldUseLottie = 
  !lottieError && 
  pet.resolvedLottieAssets?.[currentState] && 
  currentState === 'working'

if (shouldUseLottie) {
  return (
    <DotLottieSprite
      src={pet.resolvedLottieAssets![currentState]!}
      onError={handleLottieError}
      scale={pet.lottieScale?.[currentState] ?? 1.0}
      {...props}
    />
  )
}

// Try loading the static image
if (!imageError && pet.resolvedAssets[currentState]) {
  return (
    <img
      src={pet.resolvedAssets[currentState]}
      onError={handleImageError}
      alt={`${pet.name} - ${currentState}`}
      {...props}
    />
  )
}

// Ultimate fallback: Show built-in bee
const beePet = builtInPets.get('bee')
if (beePet) {
  return (
    <img
      src={beePet.resolvedAssets[currentState]}
      alt="Fallback bee"
      {...props}
    />
  )
}

// Last resort: Show placeholder
return (
  <div className="pet-fallback" {...props}>
    🐝
  </div>
)
```

### 3. IPC Error Handling

All IPC handlers return structured responses:

```typescript
interface PetOperationResult<T = any> {
  success: boolean
  data?: T
  error?: string
  fallback?: boolean // Indicates renderer should fallback to built-in pet
}

// Example: pet:create-custom
ipcMain.handle('pet:create-custom', async (event, payload) => {
  try {
    // Validate inputs
    if (!payload.name || !payload.mainImage) {
      return { 
        success: false, 
        error: 'Pet name and main image are required' 
      }
    }
    
    // Create directory
    const petDir = path.join(customPetsDir, payload.id)
    await fs.mkdir(path.join(petDir, 'assets'), { recursive: true })
    
    // Save files
    await fs.writeFile(
      path.join(petDir, 'assets', payload.mainImageName),
      payload.mainImageData
    )
    
    if (payload.lottieData) {
      await fs.writeFile(
        path.join(petDir, 'assets', 'working.lottie'),
        payload.lottieData
      )
    }
    
    // Generate manifest
    const manifest = generateManifest(payload)
    await fs.writeFile(
      path.join(petDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    )
    
    return { 
      success: true, 
      data: manifest 
    }
    
  } catch (error) {
    console.error('Failed to create custom pet:', error)
    return { 
      success: false, 
      error: error.message ?? 'Unknown error',
      fallback: false
    }
  }
})
```

### 4. Settings Store Safety

Validate selected pet on app startup:

```typescript
// In useSettingsStore initialization or a startup effect

const validateSelectedPet = async () => {
  // Wait for custom pets to load
  await loadCustomPets()
  
  const settings = useSettingsStore.getState()
  const selectedPetId = settings.pet.petId
  
  // Try to get the pet
  const pet = getPet(selectedPetId)
  
  // If pet failed to load or doesn't exist
  if (!pet || (pet.id === 'bee' && selectedPetId !== 'bee')) {
    // User selected custom pet but it's broken/missing
    console.warn(
      `Custom pet ${selectedPetId} unavailable, falling back to bee`
    )
    
    toast.warn('Your selected pet could not be loaded. Using default bee.')
    
    // Update settings to use bee
    useSettingsStore.getState().updateSetting('pet', {
      ...settings.pet,
      petId: 'bee'
    })
  }
}

// Call on app startup
validateSelectedPet()
```

### 5. User Notifications

**Soft failures (background):**
- Log to console only
- Continue with fallback
- No user interruption

**Hard failures (user-initiated):**
- Show toast notification:
  - ❌ "Failed to create custom pet. Please check the file and try again."
  - ⚠️ "Custom pet could not load. Using default bee instead."
  - ℹ️ "Some custom pet images couldn't load. Please check the files in ~/.hive/custom-pets/"

**Settings UI indicators:**
- Show warning icon (⚠️) next to broken custom pets in dropdown
- Grayed-out text for unavailable pets
- Tooltip: "This pet's files are missing or corrupted"

**Corruption detection on startup:**
- Validate all custom pet manifests
- Count: X pets loaded, Y failed
- If Y > 0, show notification:
  - "Some custom pets couldn't load (2 failed). Check Settings > Pet for details."

### 6. File System Monitoring

Watch for external changes to `~/.hive/custom-pets/`:

```typescript
// In main process (using chokidar or fs.watch)

const watcher = fs.watch(customPetsDir, { recursive: true })

watcher.on('change', debounce(async (eventType, filename) => {
  // If manifest.json changed, reload that pet
  // If directory deleted, remove from registry
  // Notify renderer to reload custom pets
  mainWindow.webContents.send('pet:custom-pets-changed')
}, 1000))

// In renderer:
window.petOps.onCustomPetsChanged(() => {
  reloadCustomPets()
})
```

**Handling scenarios:**
- User deletes folder → Remove from registry, fallback if selected
- User edits manifest.json → Reload and validate
- Manifest has syntax error → Skip that pet, log warning
- Assets deleted → Mark pet as unavailable

### 7. Edge Cases

| Scenario | Handling |
|----------|----------|
| No ~/.hive directory | Create it on first custom pet creation |
| Disk full | Show error: "Not enough disk space. Free up space and try again." |
| Name collision | Auto-append `-2`, `-3`, etc. |
| Very large images (4.9MB) | Allow but show warning: "Large image may affect performance" |
| Non-square images | Allow with warning: "Non-square images will be letterboxed" |
| Animated GIF uploaded | Reject: "Animated GIFs not supported. Use PNG or .lottie format" |
| Lottie without main image | Reject: "Main image is required" |
| Main image without Lottie | Allow (common case, static pet) |
| Invalid Lottie JSON | Show error: "Invalid Lottie file. Please check the format." |
| Symlinked custom-pets directory | Follow symlinks, validate actual files |
| Permission denied on ~/.hive | Show error: "Cannot create pet directory. Check file permissions." |
| Custom pet selected but deleted externally | Fallback to bee, show notification |
| Manifest manually edited with syntax error | Skip that pet during loading, log warning |
| Unicode characters in pet name | Support and sanitize properly (use UTF-8) |
| Extremely long pet name (100+ chars) | Truncate to 50 chars in ID generation |
| 50+ custom pets created | Block creation: "Maximum custom pets reached (50). Delete some first." |

---

## Testing Strategy

### Unit Tests

**File validation tests (`pet-validation.test.ts`):**
- ✓ Valid PNG file passes validation
- ✓ Valid WebP file passes validation
- ✓ Invalid file format rejected (JPEG, GIF)
- ✓ Oversized file rejected (> 5MB)
- ✓ Non-square image shows warning but allowed
- ✓ Below minimum dimensions rejected (< 128x128)
- ✓ Valid Lottie file passes validation
- ✓ Invalid Lottie JSON rejected
- ✓ Corrupted image file rejected

**ID generation tests (`pet-id-generation.test.ts`):**
- ✓ Simple name generates correct ID: "My Dog" → "custom-my-dog"
- ✓ Special characters removed: "My Dog!!!" → "custom-my-dog"
- ✓ Collision handling: "My Dog" (exists) → "custom-my-dog-2"
- ✓ Very long name truncated to 50 chars
- ✓ Unicode characters handled correctly

**Manifest generation tests (`pet-manifest.test.ts`):**
- ✓ Generates valid manifest with all required fields
- ✓ Applies user-selected transform
- ✓ Applies custom overlay colors
- ✓ Includes Lottie assets when provided
- ✓ Omits Lottie assets when not provided
- ✓ Sets custom: true flag

**Registry tests (`pet-registry.test.ts`):**
- ✓ Lists built-in pets correctly
- ✓ Lists custom pets after loading
- ✓ getPet() returns correct pet by ID
- ✓ getPet() falls back to bee for invalid ID
- ✓ isCustomPet() identifies custom pets correctly
- ✓ Handles missing custom pets directory gracefully
- ✓ Skips invalid manifests during loading

### Integration Tests

**IPC communication tests (`pet-ipc.test.ts`):**
- ✓ pet:create-custom creates files and manifest
- ✓ pet:list-custom returns all custom pets
- ✓ pet:delete-custom removes pet directory
- ✓ pet:update-custom modifies manifest
- ✓ pet:load-asset returns image data
- ✓ IPC errors handled gracefully

**UI interaction tests (`pet-settings-ui.test.tsx`):**
- ✓ Create Custom Pet section expands/collapses
- ✓ File upload via click works
- ✓ File upload via drag & drop works
- ✓ Validation errors display correctly
- ✓ Success state shows checkmarks
- ✓ Create button disabled when invalid
- ✓ Create button enabled when valid
- ✓ Preview modal opens and displays states
- ✓ Custom pet appears in dropdown after creation
- ✓ Selected custom pet persists after app restart

**Pet rendering tests (`pet-rendering.test.tsx`):**
- ✓ Custom pet displays in pet window
- ✓ State transitions work (idle → working → question)
- ✓ Lottie animation plays for working state
- ✓ Static fallback used when Lottie fails
- ✓ Bee fallback used when custom pet fails
- ✓ Overlay bubbles display correctly

**Error recovery tests (`pet-error-recovery.test.ts`):**
- ✓ Corrupted image falls back to bee without crash
- ✓ Missing manifest skips that pet during load
- ✓ Invalid JSON in manifest skips that pet
- ✓ Deleted custom pet falls back to bee
- ✓ File system watch detects external changes
- ✓ App survives deletion of selected pet's files

### UI/E2E Tests

**Happy path:**
1. Open Settings > Pet
2. Expand "Create Custom Pet"
3. Upload valid PNG image
4. Enter pet name
5. Select animation settings
6. Click "Preview States" - modal shows all states
7. Click "Create Pet"
8. Success toast appears
9. New pet appears in Character dropdown
10. Select custom pet
11. Enable pet
12. Click "Show pet"
13. Pet window displays custom pet

**Error paths:**
1. Upload oversized file → Error message shown
2. Upload JPEG file → Error message shown
3. Upload invalid Lottie → Error message shown
4. Create without name → Button disabled
5. Create with duplicate name → Auto-renamed with suffix

**Recovery paths:**
1. Delete custom pet folder while app running → Falls back to bee
2. Corrupt manifest.json → Skips that pet on reload
3. Delete selected pet's assets → Falls back to bee with notification

### Performance Tests

- ✓ Loading 50 custom pets completes in < 1 second
- ✓ Large image (4.9MB) uploads and validates in < 3 seconds
- ✓ Pet state transitions animate smoothly (60fps)
- ✓ File system watcher doesn't cause excessive reloads

### Accessibility Tests

- ✓ File upload areas have proper ARIA labels
- ✓ Keyboard navigation works for all controls
- ✓ Screen reader announces upload success/failure
- ✓ Color pickers have text value fallbacks
- ✓ Preview modal is keyboard accessible (ESC to close)

### Security Tests

- ✓ File type validated by content, not just extension
- ✓ Path traversal in manifest assets blocked
- ✓ File size limits enforced (5MB)
- ✓ Total custom pets limit enforced (50)
- ✓ File names sanitized (no ../ or special chars)

---

## Implementation Files

### New Files

| File | Purpose |
|------|---------|
| `src/main/ipc/pet-handlers.ts` | IPC handlers for pet operations |
| `src/main/services/pet-file-manager.ts` | File system operations for pets |
| `src/main/services/pet-validator.ts` | File validation (magic bytes, dimensions) |
| `src/renderer/src/components/settings/CustomPetForm.tsx` | Create custom pet form (extracted component) |
| `src/renderer/src/components/settings/PetPreviewModal.tsx` | Preview pet in all states |
| `src/renderer/src/lib/pet-validation.ts` | Client-side validation utilities |
| `test/pet/pet-validation.test.ts` | File validation tests |
| `test/pet/pet-id-generation.test.ts` | ID generation tests |
| `test/pet/pet-manifest.test.ts` | Manifest generation tests |
| `test/pet/pet-ipc.test.ts` | IPC communication tests |
| `test/pet/pet-settings-ui.test.tsx` | UI interaction tests |
| `test/pet/pet-error-recovery.test.ts` | Error handling tests |

### Modified Files

| File | Changes |
|------|---------|
| `src/renderer/src/pet/registry/index.ts` | Add custom pets loading, dual registry |
| `src/renderer/src/components/settings/SettingsPet.tsx` | Add Create Custom Pet section |
| `src/renderer/src/pet/PetSprite.tsx` | Add error handling and fallback logic |
| `src/shared/types/pet.ts` | Add `custom?: boolean` field to PetManifest |
| `src/preload/index.ts` | Expose petOps API |
| `src/preload/index.d.ts` | Add petOps type definitions |
| `src/main/index.ts` | Register pet:// protocol handler |
| `src/renderer/src/stores/useSettingsStore.ts` | Add pet validation on startup |

---

## Non-Functional Requirements

| Requirement | Target | Notes |
|-------------|--------|-------|
| File validation speed | < 500ms | For 5MB image |
| Custom pet creation | < 3s | End-to-end |
| Registry reload | < 1s | For 50 custom pets |
| Pet state transition | 60fps | Smooth animations |
| Error recovery | 0 crashes | Must never crash app |
| Memory usage | < 50MB | For all custom pet assets |
| Disk usage per pet | ~5-10MB | Image + manifest |
| Max custom pets | 50 | Prevent DOS via storage |
| Startup impact | < 100ms | Custom pets load async |
| File system watch latency | < 500ms | Debounced |

---

## Out of Scope

**Deferred to future iterations:**
- Multiple images per state (each state has its own image)
- Animation timeline editor (frame-by-frame control)
- Pet marketplace/sharing platform
- Cloud sync for custom pets
- AI-generated pet images
- Video file support (MP4, WebM)
- 3D model support (GLB, GLTF)
- Pet sound effects
- Per-worktree pet selection (different pet per project)
- Pet "moods" based on git status (dirty, clean, conflicts)
- Pet interactions (click to pet, drag around screen)
- Multiple pets on screen simultaneously
- Pet idle animations (when no worktree is busy)
- Import pet packs (ZIP with multiple pets)
- Community pet gallery

---

## Success Criteria

**Feature is successful when:**

✅ Users can upload PNG/WebP images and create custom pets  
✅ Users can upload optional Lottie animations for working state  
✅ Custom pets appear in Settings > Pet dropdown alongside built-in pets  
✅ Custom pets display correctly in pet window for all 5 states  
✅ File validation prevents invalid uploads with clear error messages  
✅ App never crashes from corrupted/missing custom pet files  
✅ Custom pets persist across app restarts  
✅ Preview modal shows all states before creation  
✅ Users can configure animation transforms and overlay colors  
✅ Error messages are user-friendly and actionable  
✅ File size and format guidelines are clearly displayed  
✅ Custom pets can be deleted from settings  
✅ Selected custom pet automatically falls back to bee if files are deleted  
✅ All tests pass (unit, integration, E2E)  

---

## Security Considerations

1. **File type validation:** Check magic bytes, not just extension
2. **Path sanitization:** Prevent path traversal in manifest assets
3. **Size limits:** Enforce 5MB max to prevent DoS
4. **Count limits:** Enforce 50 custom pets max
5. **Input sanitization:** Sanitize pet names, file names
6. **IPC validation:** Validate all IPC payloads in main process
7. **File permissions:** Ensure ~/.hive/custom-pets/ has appropriate permissions
8. **Protocol handler:** pet:// protocol validates file paths before serving

---

## Migration Notes

**No migration needed** - this is a new feature with no breaking changes.

**Existing users:**
- Continue using built-in pets (bee, corgi) without any changes
- Custom pets are optional and opt-in
- No database schema changes
- No settings migration required

**Future deprecations:**
- None planned

---

## Dependencies

**New dependencies to add:**

```json
{
  "dependencies": {
    "file-type": "^18.0.0",  // Magic byte detection for file validation
    "chokidar": "^3.5.3"      // File system watching (if not already present)
  }
}
```

**Existing dependencies used:**
- `electron` - File system access, protocol handler
- `react` - UI components
- `lucide-react` - Icons
- `@dotlottie/player-component` - Lottie animations (already in use)
- `zustand` - Settings store (already in use)

---

## Future Enhancements

**Phase 2 (if user feedback is positive):**
1. **Multiple images per state:** Upload separate images for idle, working, question, etc.
2. **Advanced Lottie control:** Configure which states use Lottie, per-state scale
3. **Import/export:** Share custom pets as ZIP files
4. **Edit custom pet:** Modify existing custom pet settings
5. **Pet collections:** Group related pets (e.g., "My Dogs", "Work Pets")
6. **Auto-scale detection:** Suggest optimal Lottie scale based on dimensions

**Phase 3 (if feature becomes popular):**
1. **Pet marketplace:** Browse and download community-created pets
2. **Pet editor:** Visual editor for overlay colors, transforms, preview
3. **Animated state previews:** Show animations in dropdown selector
4. **Per-project pets:** Different pet for each project
5. **Git status integration:** Pet reacts to git status (dirty, clean, conflicts)

---

## Open Questions

*None - all design decisions have been made.*

---

## Approval

**Design approved by:** User (2026-05-11)  
**Ready for implementation:** Yes  
**Next step:** Write implementation plan via `writing-plans` skill
