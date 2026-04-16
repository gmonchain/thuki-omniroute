# Thuki

<div align="center">
  <img src="src-tauri/icons/128x128.png" alt="Thuki Logo" width="128" height="128">
  
  **A Floating AI Assistant for macOS**
  
  Your context-aware AI secretary that floats above all applications, powered by [OmniRoute](https://github.com/diegosouzapw/OmniRoute)
  
  [![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
  [![macOS](https://img.shields.io/badge/macOS-11.0+-blue.svg)](https://www.apple.com/macos/)
</div>

---

## 🌟 Overview

Thuki is a powerful floating AI assistant designed specifically for macOS that seamlessly integrates into your workflow. Built with Tauri, React, and Rust, it provides instant access to AI capabilities without disrupting your focus.

### What Makes Thuki Special?

- **🎯 Always Accessible**: Double-tap Control (⌃) from anywhere to summon your AI assistant, tap Option (⌥) to toggle compact mode
- **🌐 Free AI Access**: Powered by [OmniRoute](https://github.com/diegosouzapw/OmniRoute), connecting you to dozens of AI providers with many offering free tiers
- **🖼️ Visual Understanding**: Drag, paste, or capture screenshots for multimodal AI analysis
- **💬 Context-Aware**: Automatically captures selected text as context when summoned
- **🎨 Non-Intrusive**: Floats above all windows, collapsible interface that stays out of your way
- **🔒 Privacy-First**: Optional local processing, encrypted conversation storage

---

## ✨ Key Features

### 🚀 Quick Access
- **Global Hotkey**: Double-tap Control (⌃) to instantly open Thuki from any application
- **Compact Mode Toggle**: Tap Option (⌥) to collapse/expand the chat window
- **Text Selection Integration**: Select text before summoning to automatically quote it as context
- **Floating Window**: Always-on-top interface that doesn't interrupt your workflow

### 🤖 AI Provider Integration via OmniRoute

Thuki uses [OmniRoute](https://github.com/diegosouzapw/OmniRoute) as its AI routing layer, giving you access to:

- **Multiple Providers**: OpenRouter, OpenAI, Anthropic, Google, and many more
- **Free AI Models**: Many providers offer free tiers - use powerful AI without cost
- **Easy Switching**: Change models on-the-fly with `/model` command
- **Custom Endpoints**: Connect to local models (Ollama, LM Studio) or any OpenAI-compatible API
- **Unified Interface**: One app, dozens of AI providers

> **Note**: OmniRoute aggregates multiple AI providers. Check the [OmniRoute documentation](https://github.com/diegosouzapw/OmniRoute) for the full list of supported providers and their free tier offerings.

### 🖼️ Multimodal Capabilities
- **Screenshot Capture**: Use `/screen` command to capture and analyze your display
- **Image Upload**: Drag & drop or paste images directly into conversations
- **Visual Context**: AI can see what you see - perfect for debugging, design feedback, or visual questions
- **Multiple Images**: Attach up to 4 images per message

### 💬 Smart Conversations
- **Conversation History**: Save and reload past conversations
- **Streaming Responses**: Real-time token streaming for immediate feedback
- **Thinking Mode**: Use `/think` for deeper reasoning on complex problems
- **Context Preservation**: Quoted text and images persist across conversation turns

### ⚡ Slash Commands

Thuki includes a powerful command system for quick actions:

| Command | Description |
|---------|-------------|
| `/model [name]` | Switch to a different AI model |
| `/add-model [name]` | Add a new model to your available models |
| `/del-model [name]` | Remove a model from your list |
| `/endpoint [url]` | Set custom API endpoint |
| `/api-key [key]` | Configure API key |
| `/think` | Enable deep thinking mode for complex reasoning |
| `/screen` | Capture screenshot for visual context |
| `/history` | Toggle conversation history panel |

### 🎨 User Interface
- **Compact Mode**: Minimalist input bar for quick queries
- **Expanded Mode**: Full conversation view with chat history
- **Smart Auto-Scroll**: Follows new messages unless you scroll up to read
- **Markdown Support**: Rich text rendering with code syntax highlighting
- **Dark Mode**: Beautiful dark interface optimized for focus

---

## 📦 Installation

### Prerequisites
- macOS 11.0 or later
- [Bun](https://bun.sh/) package manager
- [Rust](https://rustup.rs/) (latest stable)

### Build from Source

1. **Clone the repository**
   ```bash
   git clone https://github.com/quiet-node/thuki.git
   cd thuki
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Build the application**
   ```bash
   bun run build:dmg
   ```

4. **Run in development mode**
   ```bash
   bun run dev
   ```

The built application will be in `src-tauri/target/release/bundle/macos/`.

---

## 🚀 Getting Started

### First Launch - Onboarding

When you first launch Thuki, you'll go through a quick setup:

1. **Permissions Setup**
   - Grant Accessibility permission (required for global hotkey)
   - Grant Screen Recording permission (required for screenshot capture)
   - Restart the app after granting permissions

2. **API Configuration**
   - Set your OmniRoute endpoint (default: `http://localhost:20128/v1`)
   - Configure your API key if required
   - Select your preferred AI model

3. **Quick Tutorial**
   - Learn the basics of using Thuki
   - Understand key features and shortcuts

### Basic Usage

1. **Summon Thuki**: Double-tap Control (⌃) from anywhere
2. **Toggle Compact Mode**: Tap Option (⌥) to collapse or expand the chat window
3. **Ask a Question**: Type your query and press Enter
4. **Add Context**: 
   - Select text before summoning to quote it automatically
   - Use `/screen` to capture your display
   - Drag & drop images for visual context
5. **Save Conversations**: Click the bookmark icon to save important chats
6. **Switch Models**: Use `/model gpt-4` or similar to change AI models

---

## 🔧 Configuration

### Setting Up OmniRoute

Thuki works best with [OmniRoute](https://github.com/diegosouzapw/OmniRoute) running locally:

1. **Install OmniRoute** following their [installation guide](https://github.com/diegosouzapw/OmniRoute)
2. **Start OmniRoute server** (typically runs on `http://localhost:20128`)
3. **Configure Thuki**:
   - Use `/endpoint http://localhost:20128/v1` in Thuki
   - Or set during onboarding

### Using Free AI Providers

Many providers accessible through OmniRoute offer free tiers:

- **OpenRouter**: Free tier with various models
- **Groq**: Fast inference with free quota
- **Together AI**: Free credits for new users
- **And many more**: Check OmniRoute documentation for the complete list

### Environment Variables

You can configure Thuki using environment variables:

```bash
# API Configuration
THUKI_API_ENDPOINT=http://localhost:20128/v1
THUKI_API_KEY=your-api-key-here

# Model Configuration
THUKI_MODEL_LIST=gpt-4,claude-3-sonnet,llama-3-70b

# System Prompt (optional)
THUKI_SYSTEM_PROMPT="You are a helpful assistant..."
```

### Custom Models

Add your favorite models:
```
/add-model gpt-4-turbo
/add-model claude-3-opus
/add-model llama-3-70b
```

---

## 🎯 Use Cases

### For Developers
- **Code Review**: Select code, summon Thuki, ask for review
- **Debugging**: Capture error screenshots with `/screen` for AI analysis
- **Documentation**: Quick explanations of complex code
- **API Testing**: Ask about API responses and data structures

### For Designers
- **Design Feedback**: Upload mockups for instant critique
- **Color Schemes**: Get suggestions based on screenshots
- **Accessibility**: Check contrast and readability
- **Inspiration**: Generate ideas based on visual references

### For Writers
- **Editing**: Select text for grammar and style suggestions
- **Research**: Quick facts and information lookup
- **Brainstorming**: Generate ideas without leaving your editor
- **Translation**: Instant translation of selected text

### For Everyone
- **Quick Questions**: Instant answers without context switching
- **Learning**: Explain concepts with visual aids
- **Productivity**: Automate repetitive text tasks
- **Research**: Deep dive into topics with thinking mode

---

## 🏗️ Architecture

### Technology Stack

**Frontend**
- React 19 with TypeScript
- Framer Motion for animations
- Tailwind CSS for styling
- Vite for build tooling

**Backend**
- Rust with Tauri 2.0
- SQLite for conversation persistence
- Tokio for async runtime
- Reqwest for HTTP client

**Platform**
- macOS-specific APIs for global hotkeys
- Core Graphics for screenshot capture
- NSPanel for floating window behavior

### Project Structure

```
thuki/
├── src/                    # Frontend React application
│   ├── components/         # Reusable UI components
│   ├── hooks/             # Custom React hooks
│   ├── view/              # Main views (AskBar, Conversation, Onboarding)
│   └── App.tsx            # Main application component
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── commands.rs    # Tauri commands & AI integration
│   │   ├── database.rs    # SQLite conversation storage
│   │   ├── screenshot.rs  # Screenshot capture
│   │   ├── images.rs      # Image processing
│   │   └── permissions.rs # macOS permissions handling
│   └── Cargo.toml
└── package.json
```

---

## 🧪 Development

### Running Tests

```bash
# Frontend tests
bun run test

# Backend tests
bun run test:backend

# All tests with coverage
bun run test:all:coverage
```

### Code Quality

```bash
# Lint
bun run lint

# Format
bun run format

# Type check
bun run typecheck
```

### Building

```bash
# Build frontend only
bun run build:frontend

# Build backend only
bun run build:backend

# Build complete DMG
bun run build:dmg
```

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

```
Copyright 2026 Logan Nguyen

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

---

## 🙏 Acknowledgments

- **[OmniRoute](https://github.com/diegosouzapw/OmniRoute)** - The powerful AI routing layer that makes Thuki possible
- **[Tauri](https://tauri.app/)** - For the amazing cross-platform framework
- **[React](https://react.dev/)** - For the UI framework
- **All AI providers** accessible through OmniRoute for making AI accessible

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/quiet-node/thuki/issues)
- **Discussions**: [GitHub Discussions](https://github.com/quiet-node/thuki/discussions)
- **OmniRoute**: [OmniRoute Repository](https://github.com/diegosouzapw/OmniRoute)

---

<div align="center">
  <p>Made with ❤️ for the macOS community</p>
  <p>
    <a href="https://github.com/quiet-node/thuki">⭐ Star on GitHub</a> •
    <a href="https://github.com/quiet-node/thuki/issues">🐛 Report Bug</a> •
    <a href="https://github.com/quiet-node/thuki/issues">💡 Request Feature</a>
  </p>
</div>