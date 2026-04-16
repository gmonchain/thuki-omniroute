# Model Config Persistence Fix

## Problem

Previously, when the app was completely closed and reopened, all model configuration data (added models, active model selection) was lost. The model config was only stored in memory and not persisted to any storage.

## Solution

Model configuration is now persisted to the SQLite database using the `app_config` table. Changes to the model list and active model are automatically saved and restored on app restart.

## Implementation Details

### Database Storage

Two keys are used in the `app_config` table:
- `model_list`: Comma-separated list of all available models (e.g., "model-a,model-b,model-c")
- `active_model`: The currently selected active model (e.g., "model-b")

### Loading Priority

When the app starts, model configuration is loaded in this order:
1. **Database** (highest priority) - Previously saved configuration
2. **Environment Variable** (`THUKI_SUPPORTED_AI_MODELS`) - Fallback if database is empty
3. **Default Model List** - Used if neither source is available:
   - `qw/qwen3-coder-plus` (default active)
   - `qw/vision-model`
   - `cx/gpt-5.2`
   - `kc/openai/gpt-4o-mini`
   - `kr/claude-haiku-4.5`
   - `lc/LongCat-Flash-Chat`

### Automatic Persistence

All model configuration changes are automatically persisted:
- **Adding a model** (`add_model`) - Saves updated model list to database
- **Removing a model** (`remove_model`) - Saves updated model list and active model to database
- **Changing active model** (`set_active_model`) - Saves active model to database

### Code Changes

#### `src-tauri/src/commands.rs`
- Updated `ModelConfig` methods to accept database connection parameter
- Modified `load_model_config()` to read from database first, fallback to env variable
- Updated `set_active()`, `add_model()`, `remove_model()` to persist changes via `database::set_config()`
- Updated Tauri commands to pass database state to ModelConfig methods

#### `src-tauri/src/lib.rs`
- Reordered initialization to create database before ModelConfig
- Pass database connection to `load_model_config()`

### Testing

Added comprehensive tests to verify:
- ✅ Loading from database when present
- ✅ Database takes precedence over environment variable
- ✅ `add_model()` persists to database
- ✅ `set_active()` persists to database
- ✅ `remove_model()` persists both model list and active model to database

All tests pass successfully.

## Usage

No changes required for end users. The persistence happens automatically:

1. Add or remove models through the UI
2. Select a different active model
3. Close the app completely
4. Reopen the app
5. ✅ All model configuration is restored exactly as it was

## Default Models

The app now includes 6 default models out of the box:
1. **qw/qwen3-coder-plus** - Default active model for coding tasks
2. **qw/vision-model** - Vision-capable model
3. **cx/gpt-5.2** - GPT-5.2 model
4. **kc/openai/gpt-4o-mini** - OpenAI GPT-4o mini
5. **kr/claude-haiku-4.5** - Claude Haiku 4.5
6. **lc/LongCat-Flash-Chat** - LongCat Flash Chat

## Migration

Existing users will seamlessly migrate:
- On first launch after update, if no database config exists:
  - If `THUKI_SUPPORTED_AI_MODELS` env variable is set, those models are loaded
  - Otherwise, the 6 default models listed above are loaded
- Any changes made through the UI are saved to database
- Subsequent launches load from database
- Environment variable still works as fallback if database is empty