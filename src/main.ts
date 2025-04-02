import {
	Editor,
	Modal,
	Notice,
	Plugin,
	Setting,
	TFile,
	TFolder,
	PluginSettingTab,
	addIcon,
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
			.setDesc("Upload all local images in the current file to IPFS")
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
				"Upload all local images in markdown files within the current folder"
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
			.setDesc("Upload all local images in all markdown files")
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

		// Settings button
		new Setting(contentEl)
			.setName("Settings")
			.setDesc("Configure Pinata IPFS settings")
			.addButton((btn) =>
				btn.setButtonText("Open Settings").onClick(() => {
					this.close();
					const { workspace } = this.app;
					workspace.trigger("obsidian:open-settings");
					workspace.trigger(
						"plugin-settings:obsidian-pinata-image-uploader"
					);
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

		// Add ribbon icon
		addIcon(
			"pinata",
			'<svg viewBox="0 0 100 100"><path fill="currentColor" d="M50 0C22.4 0 0 22.4 0 50s22.4 50 50 50 50-22.4 50-50S77.6 0 50 0zm0 90c-22.1 0-40-17.9-40-40s17.9-40 40-40 40 17.9 40 40-17.9 40-40 40z"/><path fill="currentColor" d="M50 20c-16.5 0-30 13.5-30 30s13.5 30 30 30 30-13.5 30-30-13.5-30-30-30zm0 50c-11 0-20-9-20-20s9-20 20-20 20 9 20 20-9 20-20 20z"/></svg>'
		);

		this.addRibbonIcon("pinata", "Pinata IPFS Commands", () => {
			new CommandsModal(this).open();
		});

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

			const url = await this.constructIpfsUrl(ipfsHash);
			return url;
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
					editor.replaceRange(`![](${url})`, cursor);
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
				editor.replaceRange(`![](${url})`, cursor);
			}
		} catch (error) {
			new Notice(
				`Failed to upload dropped image: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		}
	}

	async processFile(file: TFile) {
		try {
			const content = await this.app.vault.read(file);
			const imageRegex =
				/!\[([^\]]*)\]\((?!https?:\/\/|ipfs:\/\/|data:)([^)]+)\)/g;
			let newContent = content;
			let modified = false;

			for (const match of content.matchAll(imageRegex)) {
				try {
					const [fullMatch, alt, imagePath] = match;
					const imageFile =
						this.app.metadataCache.getFirstLinkpathDest(
							decodeURIComponent(imagePath),
							file.path
						);

					if (imageFile instanceof TFile) {
						const url = await this.handleImageUpload(imageFile);
						newContent = newContent.replace(
							fullMatch,
							`![${alt}](${url})`
						);
						modified = true;
					}
				} catch (error) {
					console.error(
						`Failed to process image in ${file.name}:`,
						error
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
