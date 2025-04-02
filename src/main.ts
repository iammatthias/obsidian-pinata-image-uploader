import {
	Editor,
	Modal,
	Notice,
	Plugin,
	Setting,
	TFile,
	TFolder,
} from "obsidian";
import { PinataSettingTab } from "./settings";

interface PinataSettings {
	pinataJwt: string;
	pinataGateway: string;
	isPrivate: boolean;
	imageOptimization: {
		enabled: boolean;
		width: number;
		height: number;
		quality: number;
		format: "auto" | "jpeg" | "png" | "webp" | "gif";
		fit: "cover" | "contain" | "fill" | "inside" | "outside";
	};
	autoUploadPaste: boolean;
	autoUploadDrag: boolean;
	backupOriginalImages: boolean;
	backupFolder: string;
}

const DEFAULT_SETTINGS: PinataSettings = {
	pinataJwt: "",
	pinataGateway: "gateway.pinata.cloud",
	isPrivate: false,
	imageOptimization: {
		enabled: false,
		width: 800,
		height: 600,
		quality: 80,
		format: "auto",
		fit: "cover",
	},
	autoUploadPaste: true,
	autoUploadDrag: true,
	backupOriginalImages: true,
	backupFolder: ".image_backup",
};

class CommandsModal extends Modal {
	plugin: PinataImageUploaderPlugin;

	constructor(plugin: PinataImageUploaderPlugin) {
		super(plugin.app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Pinata IPFS Commands" });

		// Process current file
		new Setting(contentEl)
			.setName("Process current file")
			.setDesc(
				"Upload all images (local and remote) in the current file to IPFS"
			)
			.addButton((btn) =>
				btn
					.setButtonText("Process")
					.setCta()
					.onClick(async () => {
						const activeFile = this.app.workspace.getActiveFile();
						if (activeFile instanceof TFile) {
							try {
								new Notice("Processing current file...");
								await this.plugin.processFile(activeFile);
								new Notice(
									"Successfully processed current file"
								);
								this.close();
							} catch (error) {
								new Notice(
									`Failed to process file: ${
										error instanceof Error
											? error.message
											: String(error)
									}`
								);
							}
						} else {
							new Notice("No active file selected");
						}
					})
			);

		// Process current folder
		new Setting(contentEl)
			.setName("Process current folder")
			.setDesc(
				"Upload all images (local and remote) in markdown files within the current folder"
			)
			.addButton((btn) =>
				btn
					.setButtonText("Process")
					.setCta()
					.onClick(async () => {
						const activeFile = this.app.workspace.getActiveFile();
						if (activeFile?.parent) {
							try {
								new Notice(
									`Processing folder '${activeFile.parent.name}'...`
								);
								await this.plugin.processFolder(
									activeFile.parent
								);
								new Notice(
									`Successfully processed folder '${activeFile.parent.name}'`
								);
								this.close();
							} catch (error) {
								new Notice(
									`Failed to process folder: ${
										error instanceof Error
											? error.message
											: String(error)
									}`
								);
							}
						} else {
							new Notice("Could not determine the active folder");
						}
					})
			);

		// Process all files
		new Setting(contentEl)
			.setName("Process all files")
			.setDesc(
				"Upload all images (local and remote) in all markdown files to IPFS"
			)
			.addButton((btn) =>
				btn
					.setButtonText("Process")
					.setCta()
					.onClick(async () => {
						try {
							new Notice("Processing all files...");
							await this.plugin.processAllFiles();
							new Notice("Successfully processed all files");
							this.close();
						} catch (error) {
							new Notice(
								`Failed to process all files: ${
									error instanceof Error
										? error.message
										: String(error)
								}`
							);
						}
					})
			);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SettingTab extends Modal {
	plugin: PinataImageUploaderPlugin;

	constructor(plugin: PinataImageUploaderPlugin) {
		super(plugin.app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Pinata IPFS Settings" });

		new Setting(contentEl)
			.setName("Pinata JWT")
			.setDesc("Your Pinata JWT token")
			.addText((text) =>
				text
					.setPlaceholder("Enter your JWT")
					.setValue(this.plugin.settings.pinataJwt)
					.onChange(async (value) => {
						this.plugin.settings.pinataJwt = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(contentEl)
			.setName("Gateway URL")
			.setDesc("Custom gateway URL (optional)")
			.addText((text) =>
				text
					.setPlaceholder("gateway.pinata.cloud")
					.setValue(this.plugin.settings.pinataGateway || "")
					.onChange(async (value) => {
						this.plugin.settings.pinataGateway = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(contentEl)
			.setName("Private Uploads")
			.setDesc("Upload images as private pins")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.isPrivate)
					.onChange(async (value) => {
						this.plugin.settings.isPrivate = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(contentEl)
			.setName("Auto-upload on Paste")
			.setDesc("Automatically upload images when pasted")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoUploadPaste)
					.onChange(async (value) => {
						this.plugin.settings.autoUploadPaste = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(contentEl)
			.setName("Auto-upload on Drop")
			.setDesc("Automatically upload images when dropped")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoUploadDrag)
					.onChange(async (value) => {
						this.plugin.settings.autoUploadDrag = value;
						await this.plugin.saveSettings();
					})
			);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

export default class PinataImageUploaderPlugin extends Plugin {
	settings: PinataSettings;

	async onload() {
		await this.loadSettings();

		// Add settings tab
		this.addSettingTab(new PinataSettingTab(this.app, this));

		this.addRibbonIcon("image-up", "Pinata IPFS Commands", () => {
			new CommandsModal(this).open();
		});

		// Register protocol handler for IPFS URLs
		this.registerMarkdownPostProcessor((element, context) => {
			const images = Array.from(element.querySelectorAll("img"));
			for (const img of images) {
				const src = img.getAttribute("src");
				if (!src?.startsWith("ipfs://")) continue;

				// Extract IPFS hash
				const ipfsHash = src.replace("ipfs://", "");

				// Check if image is private based on alt text
				const isPrivate = img.alt === "private";

				// Create a placeholder URL until we can load the real one
				img.setAttribute(
					"src",
					"data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjUwIiB5PSI1MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjNjY2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+TG9hZGluZy4uLjwvdGV4dD48L3N2Zz4="
				);

				// Store IPFS data for reference
				img.setAttribute("data-ipfs-hash", ipfsHash);
				if (isPrivate) {
					img.setAttribute("data-pinata-private", "true");
				}

				// Load the actual image
				this.constructIpfsUrl(ipfsHash)
					.then((gatewayUrl) => {
						img.setAttribute("src", gatewayUrl);
					})
					.catch((error) => {
						console.error("Failed to load IPFS image:", error);
						img.classList.add("ipfs-load-error");
					});
			}
		});

		// Register interval to refresh private URLs periodically
		this.registerInterval(
			window.setInterval(() => {
				const privateImages = Array.from(
					document.querySelectorAll('img[data-pinata-private="true"]')
				);
				for (const img of privateImages) {
					const ipfsHash = img.getAttribute("data-ipfs-hash");
					if (!ipfsHash) continue;

					this.constructIpfsUrl(ipfsHash)
						.then((gatewayUrl) => {
							img.setAttribute("src", gatewayUrl);
						})
						.catch((error) => {
							console.error(
								"Failed to refresh private URL:",
								error
							);
						});
				}
			}, 1000 * 60 * 30) // Refresh every 30 minutes
		);

		this.addCommands();
		this.registerHandlers();
	}

	private addCommands() {
		this.addCommand({
			id: "show-pinata-commands",
			name: "Show Commands",
			callback: () => new CommandsModal(this).open(),
		});

		this.addCommand({
			id: "show-pinata-settings",
			name: "Show Settings",
			callback: () => {
				const { workspace } = this.app;
				workspace.trigger("obsidian:open-settings");
				workspace.trigger(
					"plugin-settings:obsidian-pinata-image-uploader"
				);
			},
		});

		this.addCommand({
			id: "process-current-file",
			name: "Process Current File",
			callback: async () => {
				const file = this.app.workspace.getActiveFile();
				if (file) await this.processFile(file);
			},
		});
	}

	private registerHandlers() {
		if (this.settings.autoUploadPaste) {
			this.registerEvent(
				this.app.workspace.on(
					"editor-paste",
					this.handlePaste.bind(this)
				)
			);
		}

		if (this.settings.autoUploadDrag) {
			this.registerEvent(
				this.app.workspace.on("editor-drop", this.handleDrop.bind(this))
			);
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async constructIpfsUrl(ipfsHash: string): Promise<string> {
		const gateway =
			this.settings.pinataGateway?.trim() || "gateway.pinata.cloud";
		const cleanGateway = gateway.replace(/^https?:\/\//, "");
		const cleanHash = ipfsHash.replace("ipfs://", "");

		let url = this.settings.isPrivate
			? `https://${cleanGateway}/files/${cleanHash}`
			: `https://${cleanGateway}/ipfs/${cleanHash}`;

		// Add image optimization parameters if enabled
		if (this.settings.imageOptimization.enabled) {
			const params = new URLSearchParams();

			if (this.settings.imageOptimization.width) {
				params.append(
					"width",
					String(this.settings.imageOptimization.width)
				);
			}
			if (this.settings.imageOptimization.height) {
				params.append(
					"height",
					String(this.settings.imageOptimization.height)
				);
			}
			if (this.settings.imageOptimization.quality) {
				params.append(
					"quality",
					String(this.settings.imageOptimization.quality)
				);
			}
			if (this.settings.imageOptimization.format !== "auto") {
				params.append("format", this.settings.imageOptimization.format);
			}
			if (this.settings.imageOptimization.fit !== "cover") {
				params.append("fit", this.settings.imageOptimization.fit);
			}

			const separator = url.includes("?") ? "&" : "?";
			url = `${url}${separator}${params.toString()}`;
		}

		// Handle private files - get signed URL after applying optimization params
		if (this.settings.isPrivate) {
			try {
				const date = Math.floor(Date.now() / 1000);
				const signedResponse = await fetch(
					"https://api.pinata.cloud/v3/files/private/download_link",
					{
						method: "POST",
						headers: {
							Authorization: `Bearer ${this.settings.pinataJwt}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							url: url,
							expires: 86400, // 24 hours
							date: date,
							method: "GET",
						}),
					}
				);

				if (!signedResponse.ok) {
					const error = await signedResponse
						.json()
						.catch(() => ({ message: signedResponse.statusText }));
					console.error("Signed URL Response:", error); // Debug log
					throw new Error(
						`Failed to get signed URL: ${
							error.error ||
							error.message ||
							signedResponse.statusText
						}`
					);
				}

				const { data: signedUrl } = await signedResponse.json();
				console.log("Signed URL:", signedUrl); // Debug log
				url = signedUrl;
			} catch (error) {
				console.error("Failed to get signed URL:", error);
				throw new Error(
					`Failed to get signed URL: ${
						error instanceof Error ? error.message : String(error)
					}`
				);
			}
		}

		return url;
	}

	private async handlePaste(evt: ClipboardEvent, editor: Editor) {
		if (!evt.clipboardData?.types.some((type) => type.startsWith("image/")))
			return;
		evt.preventDefault();

		try {
			for (const item of Array.from(evt.clipboardData.items)) {
				if (item.type.startsWith("image/")) {
					const blob = item.getAsFile();
					if (!blob) continue;

					const url = await this.handleImageUpload(blob);
					const cursor = editor.getCursor();
					// Insert the URL directly, not wrapped in image markdown
					editor.replaceRange(url, cursor);
				}
			}
		} catch (error) {
			new Notice(
				`Failed to upload pasted image: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		}
	}

	private async handleDrop(evt: DragEvent, editor: Editor) {
		const files = evt.dataTransfer?.files;
		if (!files?.length) return;

		const imageFiles = Array.from(files).filter((file) =>
			file.type.startsWith("image/")
		);
		if (!imageFiles.length) return;

		evt.preventDefault();

		try {
			for (const file of imageFiles) {
				const url = await this.handleImageUpload(file);
				const cursor = editor.getCursor();
				// Insert the URL directly, not wrapped in image markdown
				editor.replaceRange(url, cursor);
			}
		} catch (error) {
			new Notice(
				`Failed to upload dropped image: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		}
	}

	private async handleImageUpload(
		file: TFile | File | Blob
	): Promise<string> {
		try {
			const buffer =
				file instanceof TFile
					? await this.app.vault.readBinary(file)
					: await file.arrayBuffer();

			const fileName =
				file instanceof TFile
					? file.name
					: file instanceof File
					? file.name
					: `image-${Date.now()}.png`;

			const ipfsHash = await this.uploadToPinata(buffer, fileName);

			if (this.settings.backupOriginalImages && file instanceof TFile) {
				await this.backupImage(file);
			}

			// Return the complete markdown syntax
			return this.settings.isPrivate
				? `![private](ipfs://${ipfsHash})`
				: `![](ipfs://${ipfsHash})`;
		} catch (error) {
			console.error(
				`Failed to upload image ${
					file instanceof TFile ? file.path : "blob"
				}:`,
				error
			);
			throw error;
		}
	}

	private async backupImage(file: TFile): Promise<void> {
		try {
			const backupFolder =
				this.settings.backupFolder.trim() || ".image_backup";
			const folderPath = `${backupFolder}/${file.parent?.path || ""}`
				.replace(/\/+/g, "/")
				.replace(/^\//, "");

			// Create backup folder if it doesn't exist
			if (!(await this.app.vault.adapter.exists(folderPath))) {
				await this.app.vault.createFolder(folderPath);
			}

			const backupPath = `${folderPath}/${file.name}`;
			const content = await this.app.vault.readBinary(file);
			await this.app.vault.createBinary(backupPath, content);
		} catch (error) {
			console.error(`Failed to backup image ${file.path}:`, error);
			new Notice(
				`Failed to backup image: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		}
	}

	private async uploadToPinata(
		buffer: ArrayBuffer,
		fileName: string
	): Promise<string> {
		if (!this.settings.pinataJwt) {
			throw new Error("Pinata JWT not configured");
		}

		const formData = new FormData();
		const blob = new Blob([buffer]);
		const file = new File([blob], fileName);

		if (this.settings.isPrivate) {
			try {
				// Get signed upload URL
				const signedUrlResponse = await fetch(
					"https://uploads.pinata.cloud/v3/files/sign",
					{
						method: "POST",
						headers: {
							Authorization: `Bearer ${this.settings.pinataJwt}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							date: Math.floor(Date.now() / 1000),
							expires: 3600, // URL valid for 1 hour
							filename: fileName,
							keyvalues: {
								isPrivate: "true",
							},
						}),
					}
				);

				if (!signedUrlResponse.ok) {
					const error = await signedUrlResponse.json().catch(() => ({
						message: signedUrlResponse.statusText,
					}));
					throw new Error(
						`Failed to get signed upload URL: ${
							error.error ||
							error.message ||
							signedUrlResponse.statusText
						}`
					);
				}

				const { data: signedUrl } = await signedUrlResponse.json();

				// Upload file using signed URL
				formData.append("file", file);
				const uploadResponse = await fetch(signedUrl, {
					method: "POST",
					body: formData,
				});

				if (!uploadResponse.ok) {
					const error = await uploadResponse
						.json()
						.catch(() => ({ message: uploadResponse.statusText }));
					throw new Error(
						`Upload failed: ${
							error.error ||
							error.message ||
							uploadResponse.statusText
						}`
					);
				}

				const data = await uploadResponse.json();
				console.log("Private upload response:", data); // Debug log

				// For private uploads, the CID is in data.data.cid
				if (!data?.data?.cid) {
					throw new Error(
						"Upload failed - no CID returned in response"
					);
				}

				return data.data.cid;
			} catch (error) {
				console.error("Upload error:", error);
				throw new Error(
					`Error uploading private file: ${
						error instanceof Error ? error.message : String(error)
					}`
				);
			}
		} else {
			// Regular public upload
			formData.append("file", file);

			// Add metadata for public files
			const options = {
				pinataMetadata: {
					name: fileName,
					keyvalues: {
						isPrivate: "false",
					},
				},
				pinataOptions: {
					cidVersion: 1,
				},
			};

			formData.append(
				"pinataOptions",
				JSON.stringify(options.pinataOptions)
			);
			formData.append(
				"pinataMetadata",
				JSON.stringify(options.pinataMetadata)
			);

			try {
				const response = await fetch(
					"https://api.pinata.cloud/pinning/pinFileToIPFS",
					{
						method: "POST",
						headers: {
							Authorization: `Bearer ${this.settings.pinataJwt}`,
						},
						body: formData,
					}
				);

				if (!response.ok) {
					const error = await response
						.json()
						.catch(() => ({ message: response.statusText }));
					throw new Error(
						`Upload failed: ${
							error.error || error.message || response.statusText
						}`
					);
				}

				const data = await response.json();
				if (!data.IpfsHash) {
					throw new Error("Upload failed - no IPFS hash returned");
				}

				return data.IpfsHash;
			} catch (error) {
				console.error("Upload error:", error);
				throw new Error(
					`Error uploading public file: ${
						error instanceof Error ? error.message : String(error)
					}`
				);
			}
		}
	}

	private async downloadRemoteImage(url: string): Promise<Blob> {
		try {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(
					`Failed to download image: ${response.statusText}`
				);
			}
			return await response.blob();
		} catch (error) {
			console.error(`Failed to download image from ${url}:`, error);
			throw error;
		}
	}

	private isRemoteUrl(url: string): boolean {
		try {
			new URL(url);
			return url.startsWith("http://") || url.startsWith("https://");
		} catch {
			return false;
		}
	}

	private extractOriginalUrl(url: string): string {
		try {
			const parsedUrl = new URL(url);
			const hostname = parsedUrl.hostname;
			const pathname = parsedUrl.pathname;
			const searchParams = parsedUrl.searchParams;

			// Image optimization and CDN services
			switch (hostname) {
				// wsrv.nl (images.weserv.nl)
				case "wsrv.nl":
				case "images.weserv.nl":
					const weservUrl = searchParams.get("url");
					if (weservUrl) return weservUrl;
					break;

				// Cloudinary
				case "res.cloudinary.com":
					// Format: https://res.cloudinary.com/[cloud_name]/image/[delivery_type]/[transformations]/[version]/[public_id].[extension]
					const cloudinaryParts = pathname.split("/");
					if (cloudinaryParts.length > 4) {
						const cloudName = cloudinaryParts[1];
						const publicIdWithExt =
							cloudinaryParts[cloudinaryParts.length - 1];
						return `https://res.cloudinary.com/${cloudName}/image/upload/${publicIdWithExt}`;
					}
					break;

				// Imgix
				case hostname.match(/.*\.imgix\.net$/)?.input:
					// Remove transformation parameters
					return `${parsedUrl.origin}${pathname}`;

				// ImageKit
				case hostname.match(/.*\.imagekit\.io$/)?.input:
					// Remove transformation parameters
					return `${parsedUrl.origin}${pathname}`;

				// Akamai Image Manager
				case hostname.match(/.*\.akamaized\.net$/)?.input:
					return `${parsedUrl.origin}${pathname}`;

				// Fastly Image Optimizer
				case hostname.match(/.*\.fastly\.net$/)?.input:
					return `${parsedUrl.origin}${pathname}`;

				// Bunny.net Image CDN
				case hostname.match(/.*\.b-cdn\.net$/)?.input:
					return `${parsedUrl.origin}${pathname}`;

				// KeyCDN Image Processing
				case hostname.match(/.*\.kxcdn\.com$/)?.input:
					return `${parsedUrl.origin}${pathname}`;

				// WordPress.com Photon
				case "i0.wp.com":
				case "i1.wp.com":
				case "i2.wp.com":
				case "i3.wp.com":
					const wpcomUrl = pathname.substring(1); // Remove leading slash
					if (wpcomUrl.startsWith("http")) {
						return wpcomUrl;
					}
					break;

				// Amazon CloudFront
				case hostname.match(/.*\.cloudfront\.net$/)?.input:
					return `${parsedUrl.origin}${pathname}`;

				// Firebase Storage
				case "firebasestorage.googleapis.com":
					return url;

				// Shopify CDN
				case hostname.match(/.*\.shopify\.com$/)?.input:
					// Remove image transformations
					const shopifyPath = pathname.replace(
						/_(small|medium|large|grande|original|[0-9]+x[0-9]+|pico|icon|thumb|compact|master)\./,
						"."
					);
					return `${parsedUrl.origin}${shopifyPath}`;

				// Contentful Images
				case "images.ctfassets.net":
					return `${parsedUrl.origin}${pathname}`;

				// Sirv
				case hostname.match(/.*\.sirv\.com$/)?.input:
					return `${parsedUrl.origin}${pathname}`;

				// Uploadcare
				case "ucarecdn.com":
					// Remove transformation parameters
					const uploadcarePath = pathname.split("/-/")[0];
					return `${parsedUrl.origin}${uploadcarePath}`;

				// Vercel Image Optimization
				case hostname.match(/.*\.vercel\.app$/)?.input:
					const vercelUrl = searchParams.get("url");
					if (vercelUrl) return vercelUrl;
					break;
			}

			// If no specific CDN pattern is matched, return the original URL
			return url;
		} catch {
			return url;
		}
	}

	private isKnownCdnDomain(hostname: string): boolean {
		const cdnPatterns = [
			/\.cloudfront\.net$/,
			/\.akamaized\.net$/,
			/\.fastly\.net$/,
			/\.b-cdn\.net$/,
			/\.kxcdn\.com$/,
			/\.imgix\.net$/,
			/\.imagekit\.io$/,
			/\.sirv\.com$/,
			/\.shopify\.com$/,
			/\.vercel\.app$/,
			/\.cloudinary\.com$/,
			/images\.weserv\.nl$/,
			/wsrv\.nl$/,
			/\.wp\.com$/,
			/ucarecdn\.com$/,
			/images\.ctfassets\.net$/,
			/firebasestorage\.googleapis\.com$/,
		];

		return cdnPatterns.some((pattern) => pattern.test(hostname));
	}

	async processFile(file: TFile) {
		try {
			const content = await this.app.vault.read(file);
			const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
			let newContent = content;
			let modified = false;
			let processedUrls = new Map<string, string>(); // Track original URLs to their IPFS replacements

			for (const match of content.matchAll(imageRegex)) {
				try {
					const [fullMatch, alt, imagePath] = match;
					const decodedPath = decodeURIComponent(imagePath);

					// Check if we've already processed this URL in this file
					if (processedUrls.has(decodedPath)) {
						newContent = newContent.replace(
							fullMatch,
							`![${alt}](${processedUrls.get(decodedPath)})`
						);
						modified = true;
						continue;
					}

					// Skip if already on IPFS or Pinata
					if (
						decodedPath.includes("ipfs://") ||
						decodedPath.includes("pinata.cloud")
					) {
						continue;
					}

					if (this.isRemoteUrl(decodedPath)) {
						// Handle remote image
						const originalUrl =
							this.extractOriginalUrl(decodedPath);

						try {
							const parsedUrl = new URL(decodedPath);
							// Only process if it's a known CDN or if the URL points directly to an image
							if (
								this.isKnownCdnDomain(parsedUrl.hostname) ||
								this.isImageUrl(decodedPath)
							) {
								const imageBlob =
									await this.downloadRemoteImage(originalUrl);
								const fileName = `remote-${Date.now()}.${this.getFileExtFromUrl(
									originalUrl
								)}`;
								const url = await this.handleImageUpload(
									imageBlob
								);

								// Store the processed URL
								processedUrls.set(decodedPath, url);

								// Replace all instances of this image in the document
								const imageRegexEscaped = new RegExp(
									`!\\[([^\\]]*)\\]\\(${this.escapeRegExp(
										imagePath
									)}\\)`,
									"g"
								);
								newContent = newContent.replace(
									imageRegexEscaped,
									`![${alt}](${url})`
								);
								modified = true;
							}
						} catch (error) {
							console.error(
								`Failed to process remote image: ${decodedPath}`,
								error
							);
							new Notice(
								`Failed to process remote image: ${
									error instanceof Error
										? error.message
										: String(error)
								}`
							);
						}
					} else {
						// Handle local image
						const imageFile =
							this.app.metadataCache.getFirstLinkpathDest(
								decodedPath,
								file.path
							);

						if (imageFile instanceof TFile) {
							try {
								const url = await this.handleImageUpload(
									imageFile
								);

								// Store the processed URL
								processedUrls.set(decodedPath, url);

								// Replace all instances of this image in the document
								const imageRegexEscaped = new RegExp(
									`!\\[([^\\]]*)\\]\\(${this.escapeRegExp(
										imagePath
									)}\\)`,
									"g"
								);
								newContent = newContent.replace(
									imageRegexEscaped,
									`![${alt}](${url})`
								);
								modified = true;

								if (this.settings.backupOriginalImages) {
									await this.backupImage(imageFile);
								}
							} catch (error) {
								console.error(
									`Failed to process local image: ${decodedPath}`,
									error
								);
								new Notice(
									`Failed to process local image: ${
										error instanceof Error
											? error.message
											: String(error)
									}`
								);
							}
						}
					}
				} catch (error) {
					console.error(
						`Failed to process image in ${file.name}:`,
						error
					);
					new Notice(
						`Failed to process image in ${file.name}: ${
							error instanceof Error
								? error.message
								: String(error)
						}`
					);
				}
			}

			if (modified) {
				await this.app.vault.modify(file, newContent);
				new Notice(`Updated images in ${file.name}`);
			}
		} catch (error) {
			new Notice(`Failed to process ${file.name}`);
			console.error(error);
		}
	}

	private getFileExtFromUrl(url: string): string {
		try {
			const pathname = new URL(url).pathname;
			const ext = pathname.split(".").pop()?.toLowerCase();
			return ext && ["jpg", "jpeg", "png", "gif", "webp"].includes(ext)
				? ext
				: "jpg";
		} catch {
			return "jpg";
		}
	}

	private isImageUrl(url: string): boolean {
		// Check if the URL ends with a common image extension
		const imageExtensions = [
			".jpg",
			".jpeg",
			".png",
			".gif",
			".webp",
			".bmp",
			".tiff",
			".svg",
		];
		const lowercaseUrl = url.toLowerCase();
		return imageExtensions.some((ext) => lowercaseUrl.endsWith(ext));
	}

	private escapeRegExp(string: string): string {
		return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	async processFolder(folder: TFolder) {
		try {
			const files = folder.children;
			const markdownFiles = files.filter(
				(file): file is TFile =>
					file instanceof TFile && file.extension === "md"
			);

			if (!markdownFiles.length) {
				new Notice(`No markdown files found in '${folder.name}'`);
				return;
			}

			new Notice(
				`Processing ${markdownFiles.length} files in '${folder.name}'...`
			);
			for (const file of markdownFiles) {
				await this.processFile(file);
			}
			new Notice(`Finished processing folder '${folder.name}'`);
		} catch (error) {
			new Notice(`Failed to process folder '${folder.name}'`);
			console.error(error);
		}
	}

	async processAllFiles() {
		try {
			const files = this.app.vault.getMarkdownFiles();
			if (!files.length) {
				new Notice("No markdown files found in the vault");
				return;
			}

			new Notice(`Processing ${files.length} files...`);
			for (const file of files) {
				await this.processFile(file);
			}
			new Notice("Finished processing all files");
		} catch (error) {
			new Notice("Failed to process all files");
			console.error(error);
		}
	}
}
