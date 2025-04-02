import { TFile } from "obsidian";

export interface PinataClient {
	jwt: string;
	uploadFile: (file: File) => Promise<string>;
	getSignedUrl: (ipfsHash: string) => Promise<string>;
}

export interface ImageOptimizationOptions {
	width?: number;
	height?: number;
	quality?: number;
	format?: "auto" | "jpeg" | "png" | "webp" | "gif";
	fit?: "cover" | "contain" | "fill" | "inside" | "outside";
	background?: string;
}

export interface PinataSettings {
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

export type ImageFormat = "auto" | "jpeg" | "png" | "webp" | "gif";
export type ImageFit = "cover" | "contain" | "fill" | "inside" | "outside";

export interface PinataImageUploader {
	settings: PinataSettings;
	saveSettings(): Promise<void>;
	uploadImage(file: TFile): Promise<string>;
	uploadImageFromClipboard(): Promise<string>;
	uploadImageFromUrl(url: string): Promise<string>;
}

export interface PinataUploadResponse {
	IpfsHash: string;
	PinSize: number;
	Timestamp: string;
	isDuplicate?: boolean;
}

export interface PinataError {
	error: string;
	message: string;
	code?: number;
}

export interface ImageMatch {
	originalUrl: string;
	altText: string;
	lineNumber: number;
	lineContent: string;
}

export interface ProcessingStats {
	processed: number;
	updated: number;
	failed: number;
	total: number;
	startTime: number;
	endTime: number;
}

export interface SignedUrlResponse {
	signedUrl: string;
	expiresAt: number;
}

export interface PinataMetadata {
	name?: string;
	keyvalues?: Record<string, any>;
}

export interface PinataOptions {
	pinataMetadata?: PinataMetadata;
}

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
