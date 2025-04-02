import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import { PinataSettings, ImageFormat, ImageFit } from "./types";
import PinataImageUploaderPlugin from "./main";

export const DEFAULT_SETTINGS: PinataSettings = {
	pinataJwt: "",
	pinataGateway: "",
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

export class PinataSettingTab extends PluginSettingTab {
	plugin: PinataImageUploaderPlugin;

	constructor(app: App, plugin: PinataImageUploaderPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// Authentication Section
		containerEl.createEl("h2", { text: "Authentication" });

		new Setting(containerEl)
			.setName("Pinata JWT")
			.setDesc(
				"Enter your Pinata API Key (JWT). Get one from https://app.pinata.cloud/developers/api-keys"
			)
			.addText((text) =>
				text
					.setPlaceholder("Enter your Pinata JWT")
					.setValue(this.plugin.settings.pinataJwt)
					.onChange(async (value) => {
						this.plugin.settings.pinataJwt = value;
						await this.plugin.saveSettings();
					})
			);

		// Gateway Configuration Section
		containerEl.createEl("h2", { text: "Gateway Configuration" });

		new Setting(containerEl)
			.setName("Pinata Gateway")
			.setDesc(
				"Enter your dedicated Pinata Gateway domain (e.g., your-gateway.mypinata.cloud)"
			)
			.addText((text) =>
				text
					.setPlaceholder("your-gateway.mypinata.cloud")
					.setValue(this.plugin.settings.pinataGateway)
					.onChange(async (value) => {
						if (value && !value.includes(".")) {
							new Notice("Please enter a valid gateway domain");
							return;
						}
						this.plugin.settings.pinataGateway = value || "";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Use Private IPFS")
			.setDesc(
				"Upload files to Private IPFS. Files will only be accessible via temporary signed links."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.isPrivate)
					.onChange(async (value) => {
						this.plugin.settings.isPrivate = value;
						await this.plugin.saveSettings();
					})
			);

		// Upload Behavior Section
		containerEl.createEl("h2", { text: "Upload Behavior" });

		new Setting(containerEl)
			.setName("Auto-upload on Paste")
			.setDesc("Automatically upload images when pasted into a note")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoUploadPaste)
					.onChange(async (value) => {
						this.plugin.settings.autoUploadPaste = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Auto-upload on Drag & Drop")
			.setDesc("Automatically upload images when dragged into a note")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoUploadDrag)
					.onChange(async (value) => {
						this.plugin.settings.autoUploadDrag = value;
						await this.plugin.saveSettings();
					})
			);

		// Backup Configuration Section
		containerEl.createEl("h2", { text: "Backup Configuration" });

		new Setting(containerEl)
			.setName("Backup Original Images")
			.setDesc("Keep a local backup of uploaded images")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.backupOriginalImages)
					.onChange(async (value) => {
						this.plugin.settings.backupOriginalImages = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Backup Folder")
			.setDesc("Folder to store image backups (relative to vault root)")
			.addText((text) =>
				text
					.setPlaceholder(".image_backup")
					.setValue(this.plugin.settings.backupFolder)
					.onChange(async (value) => {
						this.plugin.settings.backupFolder =
							value || ".image_backup";
						await this.plugin.saveSettings();
					})
			);

		// Image Optimization Section
		containerEl.createEl("h2", { text: "Image Optimization" });

		new Setting(containerEl)
			.setName("Enable Image Optimization")
			.setDesc("Optimize images using Pinata's gateway parameters")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.imageOptimization.enabled)
					.onChange(async (value) => {
						this.plugin.settings.imageOptimization.enabled = value;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.imageOptimization.enabled) {
			new Setting(containerEl)
				.setName("Width")
				.setDesc("Maximum width in pixels")
				.addText((text) =>
					text
						.setPlaceholder("800")
						.setValue(
							String(this.plugin.settings.imageOptimization.width)
						)
						.onChange(async (value) => {
							const width = parseInt(value);
							if (isNaN(width) || width < 1) {
								new Notice("Please enter a valid width");
								return;
							}
							this.plugin.settings.imageOptimization.width =
								width;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Height")
				.setDesc("Maximum height in pixels")
				.addText((text) =>
					text
						.setPlaceholder("600")
						.setValue(
							String(
								this.plugin.settings.imageOptimization.height
							)
						)
						.onChange(async (value) => {
							const height = parseInt(value);
							if (isNaN(height) || height < 1) {
								new Notice("Please enter a valid height");
								return;
							}
							this.plugin.settings.imageOptimization.height =
								height;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Quality")
				.setDesc("Image quality (1-100)")
				.addSlider((slider) =>
					slider
						.setLimits(1, 100, 1)
						.setValue(
							this.plugin.settings.imageOptimization.quality
						)
						.setDynamicTooltip()
						.onChange(async (value) => {
							this.plugin.settings.imageOptimization.quality =
								value;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Format")
				.setDesc("Output image format")
				.addDropdown((dropdown) =>
					dropdown
						.addOptions({
							auto: "Auto",
							webp: "WebP",
							avif: "AVIF",
							jpeg: "JPEG",
							png: "PNG",
						})
						.setValue(this.plugin.settings.imageOptimization.format)
						.onChange(async (value) => {
							this.plugin.settings.imageOptimization.format =
								value as ImageFormat;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Fit")
				.setDesc("How the image should be resized")
				.addDropdown((dropdown) =>
					dropdown
						.addOptions({
							cover: "Cover",
							contain: "Contain",
							fill: "Fill",
							inside: "Inside",
							outside: "Outside",
						})
						.setValue(this.plugin.settings.imageOptimization.fit)
						.onChange(async (value) => {
							this.plugin.settings.imageOptimization.fit =
								value as ImageFit;
							await this.plugin.saveSettings();
						})
				);
		}
	}
}
