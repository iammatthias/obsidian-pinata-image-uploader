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
	SuggestModal,
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
	groups: {
		enabled: boolean;
		name: string;
	};
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
	groups: {
		enabled: false,
		name: "",
	},
};

// #endregion

// #region Modal UI

/**
 * Folder suggestion component for selecting folders in the vault
 */
class FolderSuggest extends SuggestModal<TFolder> {
	plugin: PinataImageUploaderPlugin;
	onSelect: (folder: TFolder) => void;

	constructor(
		plugin: PinataImageUploaderPlugin,
		onSelect: (folder: TFolder) => void
	) {
		super(plugin.app);
		this.plugin = plugin;
		this.onSelect = onSelect;
	}

	getSuggestions(): TFolder[] {
		const folders: TFolder[] = [];
		const files = this.app.vault.getAllLoadedFiles();
		files.forEach((file) => {
			if (file instanceof TFolder) {
				folders.push(file);
			}
		});
		return folders;
	}

	renderSuggestion(folder: TFolder, el: HTMLElement) {
		el.createEl("div", { text: folder.path || "/" });
	}

	onChooseSuggestion(folder: TFolder) {
		this.onSelect(folder);
	}
}

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

		// Select and process specific folder
		new Setting(contentEl)
			.setName("Select folder to process")
			.setDesc(
				"Choose a specific folder to process all its markdown files and subfolders"
			)
			.addButton((btn) => {
				btn.setButtonText("Select Folder")
					.setCta()
					.onClick(() => {
						new FolderSuggest(
							this.plugin,
							async (folder: TFolder) => {
								try {
									new Notice(
										`Processing folder '${
											folder.path || "/"
										}'...`
									);
									await this.plugin.processFolder(folder);
									new Notice(
										`Successfully processed folder '${
											folder.path || "/"
										}'`
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
							}
						).open();
					});
			});

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

	eq(other: WidgetType): boolean {
		return (
			other instanceof IpfsImageWidget &&
			other.ipfsHash === this.ipfsHash &&
			other.alt === this.alt
		);
	}

	toDOM() {
		const container = document.createElement("span");
		container.className = "ipfs-image-container";

		const img = document.createElement("img");
		img.alt = this.alt;
		img.className = "ipfs-image";
		img.style.opacity = "0";
		img.style.transition = "opacity 0.3s ease-in-out";
		img.setAttribute("data-ipfs-hash", this.ipfsHash);

		// Add loading placeholder
		const placeholder = document.createElement("div");
		placeholder.className = "ipfs-image-placeholder";
		placeholder.innerHTML = `<div class="ipfs-image-loading">Loading IPFS image...</div>`;
		container.appendChild(placeholder);

		img.onload = () => {
			img.style.opacity = "1";
			placeholder.style.display = "none";
		};

		img.onerror = () => {
			img.classList.add("ipfs-image-error");
			placeholder.innerHTML = `<div class="ipfs-image-error">⚠️ Failed to load IPFS image</div>`;
		};

		container.appendChild(img);
		return container;
	}
}

/**
 * Main plugin class implementing the Pinata IPFS image uploader functionality
 */
export default class PinataImageUploaderPlugin extends Plugin {
	settings: PinataSettings;
	private statusBarItem: HTMLElement;
	private processingStats = {
		totalFiles: 0,
		processedFiles: 0,
		totalImages: 0,
		processedImages: 0,
		currentFileImages: 0,
		currentFileProcessedImages: 0,
		currentFileName: "",
	};

	async onload() {
		await this.loadSettings();

		// Initialize status bar
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.style.display = "none"; // Hide initially

		// Add settings tab
		this.addSettingTab(new PinataSettingTab(this.app, this));

		// Register paste handler if enabled
		if (this.settings.autoUploadPaste) {
			this.registerEvent(
				this.app.workspace.on(
					"editor-paste",
					async (evt: ClipboardEvent, editor: Editor) => {
						// Check if clipboard has image data
						if (
							!evt.clipboardData?.types.some(
								(type) =>
									type === "Files" ||
									type.startsWith("image/")
							)
						) {
							return;
						}

						const files = Array.from(evt.clipboardData.files);
						const imageFiles = files.filter((file) =>
							file.type.startsWith("image/")
						);

						if (imageFiles.length === 0) {
							return;
						}

						// Prevent default paste behavior
						evt.preventDefault();
						evt.stopPropagation();

						try {
							for (const file of imageFiles) {
								const ext = file.type.split("/")[1] || "png";
								const fileName = `pasted-image-${Date.now()}.${ext}`;

								// Upload to IPFS
								const buffer = await file.arrayBuffer();
								const ipfsHash = await this.uploadToPinata(
									buffer,
									fileName
								);
								const ipfsMarkdown =
									this.createIpfsMarkdown(ipfsHash);

								// Insert at cursor
								const cursor = editor.getCursor();
								editor.replaceRange(ipfsMarkdown, cursor);
							}
						} catch (error) {
							new Notice(
								`Failed to upload pasted image: ${
									error instanceof Error
										? error.message
										: String(error)
								}`
							);
						}
					}
				)
			);
		}

		// Register editor extension for live preview
		const pluginInstance = this;
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
						const imgs =
							this.view.dom.querySelectorAll<HTMLImageElement>(
								"img"
							);
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

		// Register markdown post processor for reading view
		this.registerMarkdownPostProcessor(
			async (
				element: HTMLElement,
				context: MarkdownPostProcessorContext
			) => {
				const imgs = element.querySelectorAll<HTMLImageElement>(
					"img[src^='ipfs://']"
				);
				for (const img of Array.from(imgs)) {
					const src = img.getAttribute("src");
					if (!src) continue;

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
				// Upload directly to IPFS
				const ipfsHash = await this.uploadToPinata(
					await file.arrayBuffer(),
					file.name
				);
				const ipfsMarkdown = this.createIpfsMarkdown(ipfsHash);

				// Insert the IPFS markdown at cursor position
				const cursor = editor.getCursor();
				editor.replaceRange(ipfsMarkdown, cursor);
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
	 * Creates or gets a Pinata group
	 * @param groupName - The name of the group to create or get
	 * @returns Promise<string> - The group ID
	 */
	private async getOrCreateGroup(groupName: string): Promise<string> {
		if (!this.settings.pinataJwt) {
			throw new Error("Pinata JWT not configured");
		}

		try {
			console.log("Starting group operation with name:", groupName);
			console.log("JWT token present:", !!this.settings.pinataJwt);
			console.log("Groups enabled:", this.settings.groups.enabled);

			const network = this.settings.isPrivate ? "private" : "public";
			// First try to find the group using name filter
			const listUrl = `https://api.pinata.cloud/v3/groups/${network}?name=${encodeURIComponent(
				groupName
			)}`;
			console.log("Listing groups with URL:", listUrl);

			const response = await fetch(listUrl, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${this.settings.pinataJwt}`,
					"Content-Type": "application/json",
				},
			});

			console.log("List groups response status:", response.status);
			const headers: Record<string, string> = {};
			response.headers.forEach((value, key) => {
				headers[key] = value;
			});
			console.log("List groups response headers:", headers);

			if (!response.ok) {
				const errorText = await response.text();
				console.error("List groups error response:", errorText);
				throw new Error(
					`Failed to list groups: ${response.statusText} - ${errorText}`
				);
			}

			const data = await response.json();
			console.log(
				"List groups response data:",
				JSON.stringify(data, null, 2)
			);

			const existingGroup = data.data?.groups?.find(
				(group: any) => group.name === groupName
			);

			if (existingGroup) {
				console.log(
					"Found existing group:",
					JSON.stringify(existingGroup, null, 2)
				);
				return existingGroup.id;
			}

			console.log("No existing group found, creating new group...");

			// Create new group if not found
			const createResponse = await fetch(
				`https://api.pinata.cloud/v3/groups/${network}`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${this.settings.pinataJwt}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						name: groupName,
						is_public: !this.settings.isPrivate,
					}),
				}
			);

			console.log("Create group response status:", createResponse.status);
			const createHeaders: Record<string, string> = {};
			createResponse.headers.forEach((value, key) => {
				createHeaders[key] = value;
			});
			console.log("Create group response headers:", createHeaders);

			if (!createResponse.ok) {
				const errorText = await createResponse.text();
				console.error("Create group error response:", errorText);
				throw new Error(
					`Failed to create group: ${createResponse.statusText} - ${errorText}`
				);
			}

			const createData = await createResponse.json();
			console.log(
				"Create group response data:",
				JSON.stringify(createData, null, 2)
			);

			if (!createData?.data?.id) {
				console.error("Invalid group creation response:", createData);
				throw new Error("Group creation response missing ID");
			}

			return createData.data.id;
		} catch (error) {
			console.error("Group operation error:", error);
			throw new Error(
				`Error managing Pinata group: ${
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

		console.log("Starting file upload process...");
		console.log("File name:", fileName);
		console.log("Groups enabled:", this.settings.groups.enabled);
		console.log("Group name:", this.settings.groups.name);

		const formData = new FormData();
		const blob = new Blob([buffer]);
		const file = new File([blob], fileName);

		// Add network parameter
		formData.append(
			"network",
			this.settings.isPrivate ? "private" : "public"
		);
		console.log(
			"Network type:",
			this.settings.isPrivate ? "private" : "public"
		);

		// Add group if enabled
		if (this.settings.groups.enabled) {
			try {
				console.log(
					"Getting/creating group for:",
					this.settings.groups.name
				);
				const groupId = await this.getOrCreateGroup(
					this.settings.groups.name
				);
				console.log("Using group ID:", groupId);
				formData.append("group_id", groupId); // Changed from 'group' to 'group_id' to match API spec
			} catch (error) {
				console.error("Failed to get/create group:", error);
				// Continue with upload even if group operation fails
			}
		}

		formData.append("file", file);

		try {
			console.log("Uploading file to Pinata...");
			const response = await fetch(
				"https://uploads.pinata.cloud/v3/files",
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${this.settings.pinataJwt}`,
					},
					body: formData,
				}
			);

			console.log("Upload response status:", response.status);
			const uploadHeaders: Record<string, string> = {};
			response.headers.forEach((value, key) => {
				uploadHeaders[key] = value;
			});
			console.log("Upload response headers:", uploadHeaders);

			if (!response.ok) {
				const errorText = await response.text();
				console.error("Upload error response:", errorText);
				throw new Error(
					`Upload failed: ${response.statusText} - ${errorText}`
				);
			}

			const data = await response.json();
			console.log("Upload response data:", JSON.stringify(data, null, 2));

			if (!data?.data?.cid) {
				console.error("Invalid upload response:", data);
				throw new Error("Upload failed - no CID returned in response");
			}

			return data.data.cid;
		} catch (error) {
			console.error("Upload error:", error);
			throw new Error(
				`Error uploading file: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		}
	}

	// #endregion

	// #region Utility Methods

	/**
	 * Creates a markdown image link for an IPFS hash
	 * @param ipfsHash - The IPFS hash to create markdown for
	 * @returns string - The markdown-formatted image link
	 */
	private createIpfsMarkdown(ipfsHash: string): string {
		return this.settings.isPrivate
			? `![private](ipfs://${ipfsHash})`
			: `![](ipfs://${ipfsHash})`;
	}

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
	 * @returns string - The original URL or the input URL if extraction fails
	 */
	private extractOriginalUrl(url: string): string {
		try {
			const parsedUrl = new URL(url);
			const hostname = parsedUrl.hostname.toLowerCase();
			const pathname = parsedUrl.pathname;
			const searchParams = parsedUrl.searchParams;

			let extractedUrl: string | null = null;

			// Image optimization and CDN services
			switch (true) {
				// Images.weserv.nl
				case /^(wsrv\.nl|images\.weserv\.nl)$/.test(hostname): {
					extractedUrl = searchParams.get("url");
					break;
				}

				// Cloudinary
				case /^res\.cloudinary\.com$/.test(hostname): {
					const cloudinaryParts = pathname.split("/");
					if (cloudinaryParts.length > 4) {
						const cloudName = cloudinaryParts[1];
						const uploadIndex = cloudinaryParts.findIndex(
							(part) => part === "upload" || part === "fetch"
						);
						if (uploadIndex !== -1) {
							const remainingParts = cloudinaryParts.slice(
								uploadIndex + 1
							);
							const assetPathStartIndex =
								remainingParts.findIndex(
									(part) =>
										!part.match(/^[vw]_/) &&
										!part.match(/^[fc]_/) &&
										!part.match(/^[eq]_/) &&
										!part.includes(",") &&
										!part.match(
											/^(ar_|co_|fl_|l_|o_|r_|u_|x_|y_|z_)/
										)
								);

							const assetPath =
								assetPathStartIndex !== -1
									? remainingParts
											.slice(assetPathStartIndex)
											.join("/")
									: remainingParts[remainingParts.length - 1];

							extractedUrl = `https://res.cloudinary.com/${cloudName}/${cloudinaryParts[uploadIndex]}/${assetPath}`;
						}
					}
					break;
				}

				// WordPress.com
				case /^i[0-3]\.wp\.com$/.test(hostname):
				case /\.files\.wordpress\.com$/.test(hostname): {
					if (pathname.startsWith("/http")) {
						extractedUrl = pathname.substring(1);
					} else {
						const wpPath = pathname.replace(/-\d+x\d+\./, ".");
						extractedUrl = `${parsedUrl.origin}${wpPath}`;
					}
					break;
				}

				// Shopify
				case /\.shopify\.com$/.test(hostname): {
					const shopifyPath = pathname
						.replace(
							/_((?:small|medium|large|grande|original|[0-9]+x[0-9]+|pico|icon|thumb|compact|master|progressive|v[0-9]+)(?:_[a-z0-9]+)?)\./,
							"."
						)
						.replace(/@\d+(?:x\d+)?h?(?:_[a-z0-9]+)?\./, ".")
						.replace(/(_crop_[a-z]+|_position_[a-z]+)\./, ".");
					extractedUrl = `${parsedUrl.origin}${shopifyPath}`;
					break;
				}

				// Firebase Storage
				case /^firebasestorage\.googleapis\.com$/.test(hostname): {
					extractedUrl = url;
					break;
				}

				// Generic CDN patterns with query parameter stripping
				case /\.(akamaized\.net|fastly\.net|cloudfront\.net)$/.test(
					hostname
				):
				case /^images\.ctfassets\.net$/.test(hostname): {
					const cleanParams = new URLSearchParams();
					for (const [key, value] of searchParams.entries()) {
						if (!this.isOptimizationParam(key)) {
							cleanParams.append(key, value);
						}
					}

					const cleanPath = pathname.replace(
						/-\d+x\d+(\.[^.]+)$/,
						"$1"
					);
					const cleanUrl = new URL(`${parsedUrl.origin}${cleanPath}`);
					const paramString = cleanParams.toString();
					extractedUrl = paramString
						? `${cleanUrl.toString()}?${paramString}`
						: cleanUrl.toString();
					break;
				}
			}

			// If we successfully extracted a URL, validate it
			if (extractedUrl) {
				try {
					new URL(extractedUrl);
					return extractedUrl;
				} catch (error) {
					console.warn(
						`Invalid extracted URL: ${extractedUrl}, using current URL as fallback`
					);
					return url;
				}
			}

			// If we couldn't extract the original URL, return the current URL
			return url;
		} catch (error) {
			console.warn(
				`Error processing URL ${url}, using as fallback:`,
				error
			);
			return url;
		}
	}

	/**
	 * Checks if a URL parameter is related to image optimization
	 * @param param - The parameter name to check
	 * @returns boolean - True if the parameter is an optimization parameter
	 */
	private isOptimizationParam(param: string): boolean {
		const optimizationParams = [
			// Dimensions
			"w",
			"width",
			"h",
			"height",
			"fit",
			"size",
			// Quality
			"q",
			"quality",
			// Format
			"fm",
			"format",
			// Cropping
			"crop",
			"rect",
			"focal",
			// Effects
			"blur",
			"sharp",
			"brightness",
			"contrast",
			// Progressive loading
			"progressive",
			"interlace",
			// DPR
			"dpr",
			"device_pixel_ratio",
			// Auto
			"auto",
		];
		return optimizationParams.includes(param.toLowerCase());
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
			/\.shopify\.com$/,
			/\.cloudinary\.com$/,
			/images\.weserv\.nl$/,
			/wsrv\.nl$/,
			/\.wp\.com$/,
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
	 * Updates the status bar with current processing statistics
	 */
	private updateStatusBar() {
		if (this.processingStats.totalFiles > 0) {
			this.statusBarItem.style.display = "block";
			this.statusBarItem.setText(
				`Processing: ${this.processingStats.processedFiles}/${this.processingStats.totalFiles} files | ` +
					`Total: ${this.processingStats.processedImages}/${this.processingStats.totalImages} images | ` +
					`Current file (${this.processingStats.currentFileName}): ${this.processingStats.currentFileProcessedImages}/${this.processingStats.currentFileImages} images`
			);
		} else {
			this.statusBarItem.style.display = "none";
		}
	}

	/**
	 * Resets all processing statistics
	 */
	private resetProcessingStats() {
		this.processingStats = {
			totalFiles: 0,
			processedFiles: 0,
			totalImages: 0,
			processedImages: 0,
			currentFileImages: 0,
			currentFileProcessedImages: 0,
			currentFileName: "",
		};
		this.updateStatusBar();
	}

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

			// Count total images in current file
			this.processingStats.currentFileName = file.name;
			this.processingStats.currentFileImages = Array.from(
				content.matchAll(imageRegex)
			).length;
			this.processingStats.currentFileProcessedImages = 0;
			this.updateStatusBar();

			for (const match of content.matchAll(imageRegex)) {
				try {
					const [fullMatch, alt, imagePath] = match;
					const decodedPath = decodeURIComponent(imagePath);

					if (processedUrls.has(decodedPath)) {
						newContent = newContent.replace(
							fullMatch,
							processedUrls.get(decodedPath) || ""
						);
						modified = true;
						this.processingStats.currentFileProcessedImages++;
						this.processingStats.processedImages++;
						this.updateStatusBar();
						continue;
					}

					if (
						decodedPath.includes("ipfs://") ||
						decodedPath.includes("pinata.cloud")
					) {
						this.processingStats.currentFileProcessedImages++;
						this.processingStats.processedImages++;
						this.updateStatusBar();
						continue;
					}

					if (this.isRemoteUrl(decodedPath)) {
						try {
							const validatedUrl = new URL(decodedPath);
							const originalUrl = this.extractOriginalUrl(
								validatedUrl.toString()
							);

							if (
								this.isKnownCdnDomain(validatedUrl.hostname) ||
								this.isImageUrl(validatedUrl.toString())
							) {
								const imageBlob =
									await this.downloadRemoteImage(originalUrl);
								const fileName = `remote-${Date.now()}.${this.getFileExtFromUrl(
									originalUrl
								)}`;
								const ipfsHash = await this.uploadToPinata(
									await imageBlob.arrayBuffer(),
									fileName
								);
								const markdown =
									this.createIpfsMarkdown(ipfsHash);

								processedUrls.set(decodedPath, markdown);
								newContent = newContent.replace(
									fullMatch,
									markdown
								);
								modified = true;
								this.processingStats
									.currentFileProcessedImages++;
								this.processingStats.processedImages++;
								this.updateStatusBar();
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
							this.processingStats.currentFileProcessedImages++;
							this.processingStats.processedImages++;
							this.updateStatusBar();
							continue;
						}
					} else {
						const imageFile =
							this.app.metadataCache.getFirstLinkpathDest(
								decodedPath,
								file.path
							);

						if (imageFile instanceof TFile) {
							try {
								const buffer = await this.app.vault.readBinary(
									imageFile
								);
								const ipfsHash = await this.uploadToPinata(
									buffer,
									imageFile.name
								);
								const markdown =
									this.createIpfsMarkdown(ipfsHash);

								processedUrls.set(decodedPath, markdown);
								newContent = newContent.replace(
									fullMatch,
									markdown
								);
								modified = true;

								this.processingStats
									.currentFileProcessedImages++;
								this.processingStats.processedImages++;
								this.updateStatusBar();
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
								this.processingStats
									.currentFileProcessedImages++;
								this.processingStats.processedImages++;
								this.updateStatusBar();
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
					this.processingStats.currentFileProcessedImages++;
					this.processingStats.processedImages++;
					this.updateStatusBar();
					continue;
				}
			}

			if (modified) {
				await this.app.vault.modify(file, newContent);
			}

			this.processingStats.processedFiles++;
			this.updateStatusBar();
			new Notice(`Updated images in ${file.name}`);
		} catch (error) {
			new Notice(`Failed to process ${file.name}`);
			console.error(error);
			this.processingStats.processedFiles++;
			this.updateStatusBar();
		}
	}

	/**
	 * Processes all markdown files in a folder
	 * @param folder - The folder to process
	 */
	async processFolder(folder: TFolder) {
		try {
			const files = folder.children;
			const markdownFiles: TFile[] = [];
			const subFolders: TFolder[] = [];

			// Separate files and folders
			files.forEach((file) => {
				if (file instanceof TFile && file.extension === "md") {
					markdownFiles.push(file);
				} else if (file instanceof TFolder) {
					subFolders.push(file);
				}
			});

			// Process current folder's markdown files
			if (markdownFiles.length > 0) {
				// Initialize processing stats for this folder
				this.processingStats.totalFiles += markdownFiles.length;

				// Count total images in all files
				for (const file of markdownFiles) {
					const content = await this.app.vault.read(file);
					const imageMatches = content.match(
						/!\[([^\]]*)\]\(([^)]+)\)/g
					);
					this.processingStats.totalImages += imageMatches
						? imageMatches.length
						: 0;
				}

				this.updateStatusBar();
				new Notice(
					`Processing ${markdownFiles.length} files in '${
						folder.path || "/"
					}'...`
				);

				for (const file of markdownFiles) {
					await this.processFile(file);
				}
			}

			// Recursively process subfolders
			for (const subFolder of subFolders) {
				await this.processFolder(subFolder);
			}

			if (folder.parent) {
				// Only show completion notice for subfolders
				new Notice(
					`Finished processing folder '${folder.path || "/"}'`
				);
			}
		} catch (error) {
			new Notice(`Failed to process folder '${folder.path || "/"}'`);
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

			// Reset and initialize processing stats
			this.resetProcessingStats();
			this.processingStats.totalFiles = files.length;

			// Count total images in all files
			for (const file of files) {
				const content = await this.app.vault.read(file);
				const imageMatches = content.match(/!\[([^\]]*)\]\(([^)]+)\)/g);
				this.processingStats.totalImages += imageMatches
					? imageMatches.length
					: 0;
			}

			this.updateStatusBar();
			new Notice(`Processing ${files.length} files...`);

			for (const file of files) {
				await this.processFile(file);
			}

			new Notice("Finished processing all files");
			this.resetProcessingStats(); // Clear the status bar after completion
		} catch (error) {
			new Notice("Failed to process all files");
			console.error(error);
			this.resetProcessingStats(); // Clear the status bar on error
		}
	}

	// #endregion
}
