/**
 * Obsidian Pinata IPFS Image Uploader Plugin
 *
 * This plugin enables automatic uploading of images to IPFS via Pinata's service.
 * It supports both local and remote images, with features for private storage,
 * image optimization, and automatic processing of embedded images.
 *
 * @author iammatthias
 * @license MIT
 */

import {
	Editor,
	Modal,
	Notice,
	Plugin,
	Setting,
	TFile,
	TFolder,
	MarkdownPostProcessorContext,
} from "obsidian";
import {
	EditorView,
	ViewUpdate,
	ViewPlugin,
	Decoration,
	DecorationSet,
	WidgetType,
	PluginValue,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { PinataSettingTab } from "./settings";

// #region Types and Interfaces

/**
 * Plugin settings interface defining all configurable options
 */
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

/**
 * Default settings configuration
 */
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

// #endregion

// #region Modal UI

/**
 * Modal dialog for Pinata IPFS commands
 * Provides interface for batch processing images
 */
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
				"Upload all images in markdown files within the current folder"
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
			.setDesc("Upload all images in all markdown files to IPFS")
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

// #endregion

// #region Editor Integration

/**
 * Custom widget for rendering IPFS images in the editor
 * Handles both public and private images with proper URL construction
 */
class IpfsImageWidget extends WidgetType {
	constructor(
		private readonly ipfsHash: string,
		private readonly alt: string,
		private readonly plugin: PinataImageUploaderPlugin
	) {
		super();
	}

	eq(other: IpfsImageWidget): boolean {
		return other.ipfsHash === this.ipfsHash && other.alt === this.alt;
	}

	toDOM() {
		const container = document.createElement("span");
		container.className = "ipfs-image-container";

		const img = document.createElement("img");
		img.alt = this.alt;
		img.className = "ipfs-image";

		this.plugin
			.constructIpfsUrl(this.ipfsHash)
			.then((url: string) => {
				img.src = url;
				if (this.plugin.settings.isPrivate) {
					img.setAttribute("data-pinata-private", "true");
					img.setAttribute("data-ipfs-hash", this.ipfsHash);
				}
			})
			.catch((error: Error) => {
				console.error("Failed to load IPFS image:", error);
				container.textContent = "⚠️ IPFS image";
				container.className = "ipfs-image-error";
			});

		container.appendChild(img);
		return container;
	}
}

/**
 * CodeMirror plugin for handling IPFS image decorations in the editor
 */
class IpfsImagePlugin implements PluginValue {
	decorations: DecorationSet;

	constructor(
		private readonly view: EditorView,
		private readonly plugin: PinataImageUploaderPlugin
	) {
		this.decorations = this.buildDecorations();
	}

	destroy() {}

	update(update: ViewUpdate) {
		if (
			update.docChanged ||
			update.viewportChanged ||
			update.selectionSet
		) {
			this.decorations = this.buildDecorations();
		}
	}

	private buildDecorations(): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();
		const docText = this.view.state.doc.toString();
		const ipfsRegex = /!\[([^\]]*)\]\(ipfs:\/\/([^)]+)\)/g;

		let match;
		while ((match = ipfsRegex.exec(docText)) !== null) {
			const [fullMatch, alt, ipfsHash] = match;
			const from = match.index;
			const to = from + fullMatch.length;

			const decorationWidget = Decoration.replace({
				widget: new IpfsImageWidget(ipfsHash, alt, this.plugin),
				block: false,
				inclusive: true,
				side: 1,
			});

			builder.add(from, to, decorationWidget);
		}

		return builder.finish();
	}
}

// #endregion

/**
 * Main plugin class implementing the Pinata IPFS image uploader functionality
 */
export default class PinataImageUploaderPlugin extends Plugin {
	settings: PinataSettings;

	async onload() {
		await this.loadSettings();

		// Add settings tab
		this.addSettingTab(new PinataSettingTab(this.app, this));

		// Store plugin instance for the ViewPlugin
		const pluginInstance = this;

		// Register the editor extension for IPFS image preview
		this.registerEditorExtension([
			ViewPlugin.fromClass(
				class {
					constructor(public view: EditorView) {
						this.updateIpfsImages();
					}

					update(update: ViewUpdate) {
						if (update.docChanged || update.viewportChanged) {
							this.updateIpfsImages();
						}
					}

					async updateIpfsImages() {
						const imgs = this.view.dom.querySelectorAll("img");
						for (const img of Array.from(imgs)) {
							const src = img.getAttribute("src");
							if (src && src.startsWith("ipfs://")) {
								const ipfsHash = src.substring(
									"ipfs://".length
								);
								try {
									const signedUrl =
										await pluginInstance.constructIpfsUrl(
											ipfsHash
										);
									// Only update if different
									if (img.src !== signedUrl) {
										img.src = signedUrl;
									}
								} catch (error) {
									console.error(
										"Failed to update IPFS image",
										error
									);
									img.classList.add("ipfs-image-error");
									img.setAttribute(
										"alt",
										"⚠️ Failed to load IPFS image"
									);
								}
							}
						}
					}
				}
			),
		]);

		// Add styles for IPFS images
		const style = document.createElement("style");
		style.textContent = `
			.ipfs-image-error {
				display: inline-block;
				color: var(--text-error);
				font-size: 0.9em;
				padding: 2px 4px;
				border-radius: 4px;
				background-color: var(--background-modifier-error);
			}
		`;
		document.head.appendChild(style);

		// Register markdown post processor for reading view
		this.registerMarkdownPostProcessor(
			async (
				element: HTMLElement,
				context: MarkdownPostProcessorContext
			) => {
				const images = Array.from(
					element.querySelectorAll<HTMLImageElement>("img")
				);
				for (const img of images) {
					const src = img.src;
					if (!src || !src.startsWith("ipfs://")) continue;

					const ipfsHash = src.substring("ipfs://".length);
					try {
						const gatewayUrl = await this.constructIpfsUrl(
							ipfsHash
						);
						img.src = gatewayUrl;
						if (this.settings.isPrivate) {
							img.setAttribute("data-pinata-private", "true");
							img.setAttribute("data-ipfs-hash", ipfsHash);
						}
					} catch (error) {
						console.error("Failed to process IPFS image:", error);
						img.classList.add("ipfs-image-error");
						img.setAttribute("alt", "⚠️ Failed to load IPFS image");
					}
				}
			}
		);

		// Register interval to refresh private URLs periodically (every 30 minutes)
		this.registerInterval(
			window.setInterval(() => {
				const privateImages = Array.from(
					document.querySelectorAll<HTMLImageElement>(
						'img[data-pinata-private="true"]'
					)
				);
				for (const img of privateImages) {
					const ipfsHash = img.getAttribute("data-ipfs-hash");
					if (!ipfsHash) continue;

					this.constructIpfsUrl(ipfsHash)
						.then((gatewayUrl: string) => {
							img.setAttribute("src", gatewayUrl);
						})
						.catch((error: Error) => {
							console.error(
								"Failed to refresh private URL:",
								error
							);
						});
				}
			}, 1000 * 60 * 30)
		);

		// Add commands and handlers
		this.addRibbonIcon("image-up", "Pinata IPFS Commands", () => {
			new CommandsModal(this).open();
		});

		this.addCommands();
		this.registerHandlers();
	}

	async onunload() {
		// Cleanup handled by Obsidian's plugin system
	}

	// #region Command and Event Registration

	/**
	 * Registers plugin commands in Obsidian's command palette
	 */
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

	/**
	 * Registers event handlers for paste and drop events
	 */
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

	// #endregion

	// #region Settings Management

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

	// #endregion

	// #region URL Construction and Image Processing

	/**
	 * Constructs a gateway URL for an IPFS hash, handling both public and private files
	 * @param ipfsHash - The IPFS hash to create a URL for
	 * @returns Promise<string> - The constructed gateway URL
	 */
	public async constructIpfsUrl(ipfsHash: string): Promise<string> {
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
					throw new Error(
						`Failed to get signed URL: ${
							error.error ||
							error.message ||
							signedResponse.statusText
						}`
					);
				}

				const { data: signedUrl } = await signedResponse.json();
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

	// #region Event Handlers

	/**
	 * Handles paste events for automatic image upload
	 * @param evt - The clipboard event
	 * @param editor - The active editor instance
	 */
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

	/**
	 * Handles drop events for automatic image upload
	 * @param evt - The drag event
	 * @param editor - The active editor instance
	 */
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

	// #endregion

	// #region Image Upload and Processing

	/**
	 * Handles the upload of an image file to IPFS
	 * @param file - The image file to upload (can be TFile, File, or Blob)
	 * @returns Promise<string> - The markdown-formatted IPFS URL
	 */
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

	/**
	 * Creates a backup of the original image file
	 * @param file - The image file to backup
	 */
	private async backupImage(file: TFile): Promise<void> {
		try {
			const backupFolder =
				this.settings.backupFolder.trim() || ".image_backup";
			const folderPath = `${backupFolder}/${file.parent?.path || ""}`
				.replace(/\/+/g, "/")
				.replace(/^\//, "");

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

	/**
	 * Uploads a file to Pinata's IPFS service
	 * @param buffer - The file content as ArrayBuffer
	 * @param fileName - The name of the file
	 * @returns Promise<string> - The IPFS hash of the uploaded file
	 */
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
			return await this.uploadPrivateFile(file, fileName);
		} else {
			return await this.uploadPublicFile(file, fileName);
		}
	}

	/**
	 * Uploads a file to Pinata's private storage
	 * @param file - The file to upload
	 * @param fileName - The name of the file
	 * @returns Promise<string> - The IPFS hash of the uploaded file
	 */
	private async uploadPrivateFile(
		file: File,
		fileName: string
	): Promise<string> {
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
			const formData = new FormData();
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
			if (!data?.data?.cid) {
				throw new Error("Upload failed - no CID returned in response");
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
	}

	/**
	 * Uploads a file to Pinata's public storage
	 * @param file - The file to upload
	 * @param fileName - The name of the file
	 * @returns Promise<string> - The IPFS hash of the uploaded file
	 */
	private async uploadPublicFile(
		file: File,
		fileName: string
	): Promise<string> {
		const formData = new FormData();
		formData.append("file", file);

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

		formData.append("pinataOptions", JSON.stringify(options.pinataOptions));
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

	// #endregion

	// #region Utility Methods

	/**
	 * Downloads an image from a remote URL
	 * @param url - The URL to download from
	 * @returns Promise<Blob> - The downloaded image as a Blob
	 */
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

	/**
	 * Checks if a URL is a remote URL
	 * @param url - The URL to check
	 * @returns boolean - True if the URL is remote
	 */
	private isRemoteUrl(url: string): boolean {
		try {
			new URL(url);
			return url.startsWith("http://") || url.startsWith("https://");
		} catch {
			return false;
		}
	}

	/**
	 * Extracts the original URL from various CDN and optimization service URLs
	 * @param url - The URL to process
	 * @returns string - The original URL
	 */
	private extractOriginalUrl(url: string): string {
		try {
			const parsedUrl = new URL(url);
			const hostname = parsedUrl.hostname;
			const pathname = parsedUrl.pathname;
			const searchParams = parsedUrl.searchParams;

			// Image optimization and CDN services
			switch (hostname) {
				case "wsrv.nl":
				case "images.weserv.nl":
					const weservUrl = searchParams.get("url");
					if (weservUrl) return weservUrl;
					break;

				case "res.cloudinary.com":
					const cloudinaryParts = pathname.split("/");
					if (cloudinaryParts.length > 4) {
						const cloudName = cloudinaryParts[1];
						const publicIdWithExt =
							cloudinaryParts[cloudinaryParts.length - 1];
						return `https://res.cloudinary.com/${cloudName}/image/upload/${publicIdWithExt}`;
					}
					break;

				case hostname.match(/.*\.imgix\.net$/)?.input:
				case hostname.match(/.*\.imagekit\.io$/)?.input:
				case hostname.match(/.*\.akamaized\.net$/)?.input:
				case hostname.match(/.*\.fastly\.net$/)?.input:
				case hostname.match(/.*\.b-cdn\.net$/)?.input:
				case hostname.match(/.*\.kxcdn\.com$/)?.input:
				case hostname.match(/.*\.cloudfront\.net$/)?.input:
					return `${parsedUrl.origin}${pathname}`;

				case "i0.wp.com":
				case "i1.wp.com":
				case "i2.wp.com":
				case "i3.wp.com":
					const wpcomUrl = pathname.substring(1);
					if (wpcomUrl.startsWith("http")) {
						return wpcomUrl;
					}
					break;

				case "firebasestorage.googleapis.com":
					return url;

				case hostname.match(/.*\.shopify\.com$/)?.input:
					const shopifyPath = pathname.replace(
						/_(small|medium|large|grande|original|[0-9]+x[0-9]+|pico|icon|thumb|compact|master)\./,
						"."
					);
					return `${parsedUrl.origin}${shopifyPath}`;

				case "images.ctfassets.net":
				case hostname.match(/.*\.sirv\.com$/)?.input:
					return `${parsedUrl.origin}${pathname}`;

				case "ucarecdn.com":
					const uploadcarePath = pathname.split("/-/")[0];
					return `${parsedUrl.origin}${uploadcarePath}`;

				case hostname.match(/.*\.vercel\.app$/)?.input:
					const vercelUrl = searchParams.get("url");
					if (vercelUrl) return vercelUrl;
					break;
			}

			return url;
		} catch {
			return url;
		}
	}

	/**
	 * Checks if a hostname matches known CDN patterns
	 * @param hostname - The hostname to check
	 * @returns boolean - True if the hostname is a known CDN
	 */
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

	/**
	 * Gets the file extension from a URL
	 * @param url - The URL to process
	 * @returns string - The file extension
	 */
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

	/**
	 * Checks if a URL points to an image
	 * @param url - The URL to check
	 * @returns boolean - True if the URL is an image
	 */
	private isImageUrl(url: string): boolean {
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

	/**
	 * Escapes special characters in a string for use in a regular expression
	 * @param string - The string to escape
	 * @returns string - The escaped string
	 */
	private escapeRegExp(string: string): string {
		return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	// #endregion

	// #region Batch Processing

	/**
	 * Processes all images in a single markdown file
	 * @param file - The markdown file to process
	 */
	async processFile(file: TFile) {
		try {
			const content = await this.app.vault.read(file);
			const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
			let newContent = content;
			let modified = false;
			let processedUrls = new Map<string, string>();

			for (const match of content.matchAll(imageRegex)) {
				try {
					const [fullMatch, alt, imagePath] = match;
					const decodedPath = decodeURIComponent(imagePath);

					if (processedUrls.has(decodedPath)) {
						newContent = newContent.replace(
							fullMatch,
							`![${alt}](${processedUrls.get(decodedPath)})`
						);
						modified = true;
						continue;
					}

					if (
						decodedPath.includes("ipfs://") ||
						decodedPath.includes("pinata.cloud")
					) {
						continue;
					}

					if (this.isRemoteUrl(decodedPath)) {
						const originalUrl =
							this.extractOriginalUrl(decodedPath);

						try {
							const parsedUrl = new URL(decodedPath);
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

								processedUrls.set(decodedPath, url);

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

								processedUrls.set(decodedPath, url);

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

	/**
	 * Processes all markdown files in a folder
	 * @param folder - The folder to process
	 */
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

	/**
	 * Processes all markdown files in the vault
	 */
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

	// #endregion
}
