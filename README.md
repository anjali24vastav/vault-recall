# 🧠 Vault Recall

**AI-powered note resurfacing for Obsidian** — rediscover forgotten notes, get contextual suggestions, and keep your vault healthy. 100% local, zero data leaves your machine.

---

## ✨ Features

### 💡 Smart Daily Digest
Every day, Vault Recall surfaces 3-5 forgotten notes that are **semantically related** to your recent work. Notes are scored by:
- **Relevance** — how similar they are to what you've been writing
- **Age** — older, forgotten notes get priority
- **Orphan status** — unlinked notes get a boost so you can reconnect them

### 🔗 "You Wrote About This" Sidebar
While you're writing, the sidebar shows forgotten notes related to your **current note**. Perfect for finding connections you didn't know existed.

### ❤️ Vault Health Score
Get a 0-100 health score for your vault with actionable insights:
- 🏝️ **Orphan notes** — notes nothing links to
- 💔 **Broken links** — links pointing to non-existent notes
- 📭 **Empty notes** — notes with almost no content
- 👯 **Duplicate titles** — potential duplicate notes

---

## 🔒 Privacy First

Vault Recall runs **100% locally**. No API calls, no cloud sync, no telemetry. Your notes never leave your machine. The AI uses a lightweight TF-IDF algorithm — no heavy ML models, no GPU required.

---

## 📦 Installation

### From Obsidian Community Plugins (Recommended)
1. Open **Settings → Community Plugins → Browse**
2. Search for **"Vault Recall"**
3. Click **Install**, then **Enable**

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/YOUR_USERNAME/vault-recall/releases)
2. Create a folder: `YOUR_VAULT/.obsidian/plugins/vault-recall/`
3. Copy the three files into that folder
4. Restart Obsidian and enable the plugin in **Settings → Community Plugins**

---

## 🚀 Getting Started

1. **Click the 🧠 brain icon** in the left ribbon to open the sidebar
2. The vault will **auto-index** on first load (takes a few seconds)
3. Switch between tabs:
   - **Recall** — your daily resurfaced notes
   - **Related** — notes related to what you're currently editing
   - **Health** — your vault health score and issues

### Commands (Ctrl/Cmd + P)
| Command | Description |
|---------|-------------|
| `Vault Recall: Open sidebar` | Open the Vault Recall sidebar |
| `Vault Recall: Reindex vault` | Force a full vault reindex |
| `Vault Recall: Show daily digest` | Open the daily digest modal |

---

## ⚙️ Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Daily digest count** | Number of notes to resurface | 5 |
| **Minimum note age** | Only resurface notes older than X days | 7 days |
| **Excluded folders** | Folders to skip during indexing | None |
| **Show digest on startup** | Auto-show the daily digest | On |

---

## 💎 Free vs Pro

| Feature | Free | Pro |
|---------|------|-----|
| Daily digest | 3 notes/day | Unlimited |
| Related notes sidebar | ✅ | ✅ |
| Vault health score | Score only | Full details + issues |
| Excluded folders | 2 folders | Unlimited |
| AI flashcards (coming soon) | ❌ | ✅ |

**[Upgrade to Pro →](https://vastavanjali.gumroad.com/l/nrwpa)**

---

## 🛠️ Development

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/vault-recall.git
cd vault-recall

# Install dependencies
npm install

# Development build (with watch)
npm run dev

# Production build
npm run build
```

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🤝 Support

- 🐛 [Report a bug](https://github.com/YOUR_USERNAME/vault-recall/issues)
- 💡 [Request a feature](https://github.com/YOUR_USERNAME/vault-recall/issues)
- ⭐ Star this repo if you find it useful!
