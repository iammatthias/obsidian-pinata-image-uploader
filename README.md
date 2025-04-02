# Obsidian Pinata IPFS Image Uploader

A plugin for [Obsidian](https://obsidian.md) that automatically uploads embedded images to [Pinata](https://pinata.cloud) via IPFS, replacing local image references in markdown with `ipfs://` links. It also handles gateway proxying for image display, supporting both public and private gateways with JWT-based authentication and signed URLs when needed.

## Features

-   🚀 Automatic image upload to IPFS via Pinata
-   🔒 Support for both public and private IPFS storage
-   🖼️ Image optimization via Pinata's gateway parameters
-   📎 Auto-upload on paste and drag & drop
-   💾 Local backup of uploaded images
-   🔄 Batch processing of existing images
-   📝 Clean markdown with `ipfs://` links

## Installation

1. Open Obsidian Settings
2. Go to Community Plugins and disable Safe Mode
3. Click Browse and search for "Pinata IPFS Image Uploader"
4. Install the plugin
5. Enable the plugin in your Community Plugins list

## Configuration

### Required Settings

1. **Pinata JWT**: Get your JWT from [Pinata's Developer Portal](https://app.pinata.cloud/developers/api-keys)
2. **Pinata Gateway**: Your dedicated gateway domain (e.g., `your-gateway.mypinata.cloud`)

### Optional Settings

-   **Private IPFS**: Enable for private file storage (requires appropriate JWT permissions)
-   **Auto-upload**: Configure automatic upload on paste and drag & drop
-   **Backup**: Enable local backup of uploaded images
-   **Image Optimization**: Configure gateway-level image optimization parameters

## Usage

### Manual Upload

1. Open the Command Palette (Cmd/Ctrl + P)
2. Search for "Pinata IPFS Commands"
3. Choose from:
    - Process current file
    - Process current folder
    - Process all files

### Automatic Upload

With auto-upload enabled:

1. Copy an image to your clipboard
2. Paste directly into your note
3. The image will be automatically uploaded and linked

Or:

1. Drag an image file into your note
2. The image will be automatically uploaded and linked

### Image Links

Images are stored with `ipfs://` links in your markdown:

```markdown
![](ipfs://QmYourIPFSHash)
```

These links are automatically processed to display via your configured gateway.

## Development

### Prerequisites

-   Node.js
-   npm or yarn
-   Obsidian developer tools

### Setup

1. Clone the repository:

    ```bash
    git clone https://github.com/iammatthias/obsidian-pinata-image-uploader.git
    cd obsidian-pinata-image-uploader
    ```

2. Install dependencies:

    ```bash
    npm install
    ```

3. Build the plugin:

    ```bash
    npm run build
    ```

4. Copy or symlink to your Obsidian plugins folder:
    ```bash
    cp -r dist /path/to/your/vault/.obsidian/plugins/obsidian-pinata-image-uploader
    ```

### Development Commands

-   `npm run dev` - Start development build with hot reload
-   `npm run build` - Build the plugin
-   `npm run clean` - Clean the build directory

## Support

-   [GitHub Issues](https://github.com/iammatthias/obsidian-pinata-image-uploader/issues)
-   [Obsidian Forum](https://forum.obsidian.md)

## License

[MIT License](LICENSE)

## Credits

-   Built with [Obsidian Plugin API](https://github.com/obsidianmd/obsidian-api)
-   Uses [Pinata SDK](https://www.npmjs.com/package/@pinata/sdk)
