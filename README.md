# Obsidian Pinata IPFS Image Uploader

A plugin for [Obsidian](https://obsidian.md) that uploads embedded images to [Pinata](https://pinata.cloud). The plugin replaces both local and remote image references in markdown with `ipfs://` URIs, and handles gateway proxying for image display.

## Prerequisites

**Pinata Account**: This plugin requires a Pinata account to function. - [Sign up for Pinata](https://app.pinata.cloud/register)

## Features

### Core Features

-   🔒 Support for both public and private IPFS storage on Pinata
-   🖼️ Image optimization options via Pinata's gateway parameters
-   📎 Auto-upload on paste and drag & drop
-   🔄 Batch processing for existing images (single file, folder, or entire vault)
-   🌐 Support for processing remote images
-   📝 Clean markdown with `ipfs://` URIs
-   🔄 Automatic URL refresh for private files (every 30 minutes)
-   🎨 Live preview support in editor

### Technical Features

-   🎯 Smart handling of remote images
    -   For best results, use direct image URLs in your markdown
        -   This will require manually trigging the upload through the Ribbon icon or Command Palette
    -   Copy/paste or drag and drop images directly when possible for new images
-   🛡️ Error handling and reporting
-   📦 Efficient file processing and management
-   🔍 Intelligent URL processing and normalization
-   💾 Performance optimizations with caching

## Installation

### Community Plugin Installation (Coming Soon)

> ⚠️ This method will be available once the plugin is added to the Obsidian Community Plugins directory.

1. Open Obsidian Settings
2. Go to Community Plugins and disable Safe Mode
3. Click Browse and search for "Pinata IPFS Image Uploader"
4. Install the plugin
5. Enable the plugin in your Community Plugins list

### Manual Installation (Current Method)

1. Download the latest release from the [GitHub releases page](https://github.com/iammatthias/obsidian-pinata-image-uploader/releases)
2. Extract the downloaded zip archive
3. Copy the extracted folder to your Obsidian vault's plugins folder: `<vault>/.obsidian/plugins/`
4. Enable the plugin in your Obsidian settings under Community Plugins

### Pinata Setup

1. [Create a Pinata account](https://app.pinata.cloud/register) if you haven't already
2. Generate an API Key:
    - Go to [Pinata's Developer Portal](https://app.pinata.cloud/developers/api-keys)
    - Click "New Key"
    - Enable the necessary permissions:
        - For public files: `pinFileToIPFS`
        - For private files: Additional permissions required
    - Copy your JWT token
3. Configure the plugin with your Pinata credentials (see Configuration section)

## Configuration

### Required Settings

1. **Pinata JWT**: Your JWT token from [Pinata's Developer Portal](https://app.pinata.cloud/developers/api-keys)

    - **Required for all usage**
    - For private files: Ensure your JWT has the necessary permissions
    - For public files: Basic upload permissions are sufficient
    - Keep this token secure and never share it

2. **Pinata Gateway**: Your gateway domain (defaults to `gateway.pinata.cloud`)
    - For private files: Use your dedicated gateway (e.g., `your-gateway.mypinata.cloud`)
    - For public files: The default gateway works fine
    - Custom gateways available on paid Pinata plans

### Optional Settings

#### Storage Options

-   **Private IPFS**: Toggle for private file storage
    -   When enabled: Files are stored privately and accessed via signed URLs
    -   When disabled: Files are publicly accessible via IPFS

#### Groups

-   **Enable Groups**: Toggle for organizing images into Pinata groups
    -   When enabled: Images are organized into a named group in Pinata
    -   **Group Name**: Name of the Pinata group to organize images
    -   Groups are created automatically if they don't exist
    -   Useful for organizing and managing images across your vault

#### Upload Behavior

-   **Auto-upload on Paste**: Automatically upload images when pasted
-   **Auto-upload on Drag**: Automatically upload images when dragged into notes

#### Image Optimization

Configure how images are served through Pinata's gateway:

-   **Enable Optimization**: Toggle gateway-level image processing
-   **Width**: Target width in pixels
-   **Height**: Target height in pixels
-   **Quality**: JPEG/WebP quality (1-100)
-   **Format**: Output format (auto/jpeg/png/webp/gif)
-   **Fit**: Resizing behavior (cover/contain/fill/inside/outside)

## Usage

### Command Palette Options

Access via Command Palette (Cmd/Ctrl + P):

1. **Show Commands**: Opens the Pinata IPFS Commands modal
2. **Show Settings**: Opens plugin settings
3. **Process Current File**: Process images in active file

### Modal Menu Options

Access via ribbon icon or command palette:

1. **Process current file**: Upload all images in current note
2. **Process current folder**: Upload images in all notes in current folder
3. **Process all files**: Upload images in all notes in the vault

### Automatic Upload Methods

#### Paste Upload (Recommended)

1. Copy an image to clipboard
2. Paste directly into note (Cmd/Ctrl + V)
3. Image uploads automatically if enabled

#### Drag and Drop Upload (Recommended)

1. Drag image file into note
2. Image uploads automatically if enabled

### Remote Image Handling

The plugin can process remote images from various sources. For best results:

1. Use direct image URLs when possible
2. Copy/paste or drag and drop the original image when available
3. Some CDN and optimized image URLs will be automatically processed

### Image Link Format

Images are stored using `ipfs://` protocol:

```markdown
![](ipfs://QmYourIPFSHash)
```

For private files:

```markdown
![private](ipfs://QmYourIPFSHash)
```

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

## Support

-   [GitHub Issues](https://github.com/iammatthias/obsidian-pinata-image-uploader/issues)
-   [Obsidian Forum](https://forum.obsidian.md)

## License

[MIT License](LICENSE)

## Credits

-   Built with [Obsidian Plugin API](https://github.com/obsidianmd/obsidian-api)
-   Uses Pinata's REST API for IPFS interactions
