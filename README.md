# Obsidian Pinata IPFS Image Uploader

A plugin for [Obsidian](https://obsidian.md) that uploads embedded images to [Pinata](https://pinata.cloud). The plugin replaces both local and remote image references in markdown with `ipfs://` uris, and handles gateway proxying for image display.

## Prerequisites

-   **Pinata Account**: This plugin requires a Pinata account to function.
    -   [Sign up for Pinata](https://app.pinata.cloud/register)

## Features

### Core Features

-   🔒 Support for both public and private IPFS storage with JWT authentication
-   🖼️ Image optimization options via Pinata's gateway parameters
-   📎 Auto-upload on paste and drag & drop
-   💾 Optional local backup of original images
-   🔄 Batch processing for existing images (single file, folder, or entire vault)
-   🌐 Smart handling of remote images from popular CDNs
-   📝 Clean markdown with `ipfs://` links
-   🔄 Automatic URL refresh for private files (every 30 minutes)
-   🎨 Live preview support in editor

### Technical Features

-   🎯 Smart CDN detection and URL normalization for:
    -   Cloudinary
        -   Handles both upload and fetch delivery types
        -   Preserves full asset paths including folders
        -   Intelligent transformation detection:
            -   Width and version parameters
            -   Format and crop settings
            -   Effects and quality adjustments
            -   Aspect ratio and color adjustments
    -   WordPress.com
        -   Supports i[0-3].wp.com and \*.files.wordpress.com
        -   Handles direct URLs and size variants
    -   Shopify
        -   Comprehensive size variant handling:
            -   Standard sizes (small, medium, large, etc.)
            -   Retina variants (@2x, @3x)
            -   Custom dimensions with height modifiers
            -   Progressive and versioned images
        -   Supports compound transformations
        -   Handles crop and position parameters
    -   Image Optimization Services
        -   Images.weserv.nl (with URL extraction)
        -   Imgix (with parameter cleaning)
        -   ImageKit (with parameter cleaning)
        -   Vercel Image Optimization (multiple URL parameters)
    -   Enterprise CDNs
        -   Akamai
        -   Fastly
        -   CloudFront
        -   BunnyCDN
        -   KeyCDN
    -   Specialized Services
        -   Firebase Storage (direct URLs)
        -   Contentful (images.ctfassets.net)
        -   Sirv
        -   Uploadcare (transformation removal)
    -   Common Optimizations Handled
        -   Dimension parameters (width, height, fit)
        -   Quality and format settings
        -   Cropping and focal points
        -   Effects (blur, sharp, etc.)
        -   Progressive loading
        -   DPR/Device pixel ratio
-   🛡️ Error handling and reporting:
    -   Graceful fallbacks
    -   Detailed error notifications
    -   Comprehensive error logging
-   📦 Advanced file handling:
    -   Automatic file type detection
    -   Smart extension handling with fallbacks
    -   Duplicate upload prevention
    -   Binary file processing
-   🔍 URL processing:
    -   Intelligent URL parsing and normalization
    -   CDN-specific optimization parameter stripping
    -   Automatic handling of encoded URLs
    -   Smart path resolution
-   💾 Performance optimizations:
    -   URL caching to prevent duplicate uploads
    -   Batch processing for files and folders
    -   Efficient binary file handling

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

#### Upload Behavior

-   **Auto-upload on Paste**: Automatically upload images when pasted
-   **Auto-upload on Drag**: Automatically upload images when dragged into notes
-   **Backup Original Images**: Keep local copies of uploaded images
    -   **Backup Folder**: Specify where to store backups (default: `.image_backup`)

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

#### Paste Upload

1. Copy an image to clipboard
2. Paste directly into note (Cmd/Ctrl + V)
3. Image uploads automatically if enabled

#### Drag and Drop Upload

1. Drag image file into note
2. Image uploads automatically if enabled

### Remote Image Handling

The plugin can process remote images from various sources:

-   Popular CDNs (Cloudinary, Imgix, etc.)
-   WordPress media
-   General image URLs

Remote images are:

1. Downloaded
2. Uploaded to IPFS
3. Replaced with IPFS links

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

### Development Commands

-   `npm run dev` - Development build with hot reload
-   `npm run build` - Production build
-   `npm run clean` - Clean build directory

## Support

-   [GitHub Issues](https://github.com/iammatthias/obsidian-pinata-image-uploader/issues)
-   [Obsidian Forum](https://forum.obsidian.md)

## License

[MIT License](LICENSE)

## Credits

-   Built with [Obsidian Plugin API](https://github.com/obsidianmd/obsidian-api)
-   Uses Pinata's REST API for IPFS interactions
